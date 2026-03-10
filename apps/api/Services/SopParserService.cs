using System.Text;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using UglyToad.PdfPig;

namespace ClawCommerce.Api.Services;

public class SopParserService
{
    private static readonly string[] AllowedExtensions = [".pdf", ".docx", ".txt"];

    // Rule #17: File magic number signatures (validate by content, not extension)
    private static readonly Dictionary<string, byte[][]> FileSignatures = new()
    {
        [".pdf"] = [new byte[] { 0x25, 0x50, 0x44, 0x46 }], // %PDF
        [".docx"] = [new byte[] { 0x50, 0x4B, 0x03, 0x04 }], // PK (ZIP)
    };

    public async Task<SopParseResult> ParseAsync(Stream fileStream, string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();

        if (!AllowedExtensions.Contains(extension))
            return SopParseResult.Error($"Unsupported file type. Allowed: {string.Join(", ", AllowedExtensions)}");

        // Rule #17: Validate file signature (magic bytes) for binary formats
        if (FileSignatures.TryGetValue(extension, out var signatures))
        {
            var headerBuffer = new byte[4];
            var bytesRead = await fileStream.ReadAsync(headerBuffer.AsMemory(0, 4));
            fileStream.Position = 0; // Reset for parsing

            if (bytesRead < 4 || !signatures.Any(sig => headerBuffer.AsSpan(0, sig.Length).SequenceEqual(sig)))
                return SopParseResult.Error($"File content does not match expected {extension} format. File may be corrupted or misnamed.");
        }

        try
        {
            var rawText = extension switch
            {
                ".pdf" => ExtractFromPdf(fileStream),
                ".docx" => ExtractFromDocx(fileStream),
                ".txt" => await ExtractFromTxt(fileStream),
                _ => throw new NotSupportedException()
            };

            if (string.IsNullOrWhiteSpace(rawText))
                return SopParseResult.Error("Could not extract any text from the file. Is it empty or image-only?");

            var rules = ExtractRules(rawText);

            return new SopParseResult
            {
                Success = true,
                RawText = rawText.Length > 50_000 ? rawText[..50_000] : rawText,
                Rules = rules
            };
        }
        catch (Exception ex)
        {
            return SopParseResult.Error($"Failed to parse file: {ex.Message}");
        }
    }

    // ── File extraction ────────────────────────────────────────────────

    private static string ExtractFromPdf(Stream stream)
    {
        using var document = PdfDocument.Open(stream);
        var sb = new StringBuilder();
        foreach (var page in document.GetPages())
            sb.AppendLine(page.Text);
        return sb.ToString().Trim();
    }

    private static string ExtractFromDocx(Stream stream)
    {
        using var doc = WordprocessingDocument.Open(stream, false);
        var body = doc.MainDocumentPart?.Document?.Body;
        if (body is null) return string.Empty;

        var sb = new StringBuilder();
        foreach (var paragraph in body.Elements<Paragraph>())
            sb.AppendLine(paragraph.InnerText);
        return sb.ToString().Trim();
    }

    private static async Task<string> ExtractFromTxt(Stream stream)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return (await reader.ReadToEndAsync()).Trim();
    }

    // ── Core extraction ────────────────────────────────────────────────

    private static List<SopRuleCategory> ExtractRules(string text)
    {
        // Normalize line endings
        text = Regex.Replace(text, @"\r\n?", "\n");
        // Remove emojis
        text = Regex.Replace(text, @"[\u2600-\u27BF]", "");
        text = Regex.Replace(text, @"\p{Cs}", "");

        // Phase 1: PDF text often lacks newlines — insert line breaks before known patterns
        // Before bullet markers: ● ○ — always split, these are ALWAYS list items
        text = Regex.Replace(text, @"\s*([●○])\s*", "\n$1 ");
        // Before numbered steps: "1. " "2. " (when preceded by text)
        text = Regex.Replace(text, @"(?<=\S)\s{2,}(\d{1,2}[.)]\s)", "\n$1");
        // Before ALL CAPS headers (3+ words of caps)
        text = Regex.Replace(text, @"(?<=\S)\s{2,}([A-Z]{3,}[\s&A-Z/']*(?:\s|$))", "\n$1");
        // Before "(Note:" patterns
        text = Regex.Replace(text, @"\s*(\(Note:)", "\n$1");

        // Phase 2: Collapse sub-lists into parent
        text = CollapseSubLists(text);

        // Phase 3: Split and clean
        var lines = text.Split('\n', StringSplitOptions.TrimEntries)
                        .Where(l => !string.IsNullOrWhiteSpace(l))
                        .ToList();

        var titleRules = new List<string>();
        var descRules = new List<string>();
        var pricingRules = new List<string>();
        var tagRules = new List<string>();
        var dontRules = new List<string>();
        var productRules = new List<string>();
        var generalRules = new List<string>();
        var prompts = new List<string>();

        string? currentSection = null;

        for (var i = 0; i < lines.Count; i++)
        {
            var line = lines[i];
            var lower = line.ToLowerInvariant();

            // Detect section headers → set context, don't add as rule
            if (IsSectionHeader(line, lower))
            {
                currentSection = DetectSection(lower);
                continue;
            }

            // Extract ChatGPT prompt blocks
            if (lower.Contains("chatgpt prompt") || lower.Contains("use this prompt"))
            {
                var prompt = ExtractPromptBlock(lines, ref i);
                if (prompt is not null)
                    prompts.Add(prompt);
                continue;
            }

            // Extract inline (Note: ...) as separate rules
            var noteMatch = Regex.Match(line, @"\(Note:\s*(.+?)\)$", RegexOptions.IgnoreCase);
            if (noteMatch.Success)
            {
                var noteRule = Clean(noteMatch.Groups[1].Value);
                if (noteRule.Length >= 10)
                    RouteRule(noteRule, currentSection, titleRules, descRules, pricingRules, tagRules, dontRules, productRules, generalRules);
                // Remove the Note from the line and continue processing the rest
                line = line[..noteMatch.Index].Trim();
                if (string.IsNullOrWhiteSpace(line)) continue;
            }

            var cleaned = Clean(line);
            if (!IsAgentRelevant(cleaned)) continue;

            RouteRule(cleaned, currentSection, titleRules, descRules, pricingRules, tagRules, dontRules, productRules, generalRules);
        }

        // Build output
        var result = new List<SopRuleCategory>();
        AddCategory(result, "Title Format", "type", titleRules);
        AddCategory(result, "Description Format", "align-left", descRules);
        AddCategory(result, "Pricing Rules", "dollar-sign", pricingRules);
        AddCategory(result, "Tag & Collection Rules", "tag", tagRules);
        AddCategory(result, "Product Rules", "check-circle", productRules);
        AddCategory(result, "Don'ts", "x-circle", dontRules);
        AddCategory(result, "General Rules", "book-open", generalRules);

        if (prompts.Count > 0)
            result.Add(new SopRuleCategory { Name = "Your Existing Prompts", Icon = "message-circle", Rules = prompts.Take(5).ToList() });

        // Fallback
        if (result.Count == 0)
        {
            var all = lines.Select(Clean).Where(l => l.Length >= 15).Distinct().Take(20).ToList();
            if (all.Count > 0)
                result.Add(new SopRuleCategory { Name = "Extracted Rules", Icon = "check-circle", Rules = all });
        }

        return result;
    }

    /// <summary>
    /// Merges sub-list items (○ ● - preceded by a colon parent) into a single line.
    /// "NEVER sell these materials:\n○ Linen\n○ Cotton" → "NEVER sell these materials: Linen, Cotton"
    /// "NEVER use these product names:\n● Coco\n● Chanel" → "NEVER use these product names: Coco, Chanel"
    /// </summary>
    private static string CollapseSubLists(string text)
    {
        var lines = text.Split('\n');
        var result = new List<string>();

        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i].TrimEnd();

            // Check if this line ends with ":" and the next lines are sub-items
            if (line.TrimEnd().EndsWith(':') && i + 1 < lines.Length && IsSubItem(lines[i + 1]))
            {
                var subItems = new List<string>();
                var j = i + 1;
                while (j < lines.Length && IsSubItem(lines[j]))
                {
                    var item = Regex.Replace(lines[j].Trim(), @"^[○●▪▸►→\-\*]\s*", "").Trim();
                    if (item.Length > 0 && item.Length < 40) // sub-items are short
                        subItems.Add(item);
                    j++;
                }

                if (subItems.Count > 0)
                {
                    result.Add($"{line} {string.Join(", ", subItems)}");
                    i = j - 1; // skip processed sub-items
                    continue;
                }
            }

            result.Add(line);
        }

        return string.Join('\n', result);
    }

    private static bool IsSubItem(string line)
    {
        var trimmed = line.Trim();
        // Sub-items: start with ○ (sub-bullet) and are short single words/phrases
        // Also catch ● items that are just single words (brand names, materials)
        if (Regex.IsMatch(trimmed, @"^[○]\s*\S") && trimmed.Length < 60) return true;
        if (Regex.IsMatch(trimmed, @"^[●]\s*\S") && trimmed.Length < 25) return true; // single-word ● items like brand names
        return false;
    }

    private static bool IsSectionHeader(string line, string lower)
    {
        if (line.StartsWith('#')) return true;
        // ALL CAPS lines that are short
        if (line.Length < 60 && line.Length > 3 && line == line.ToUpperInvariant() && line.Any(char.IsLetter)) return true;
        // "DOS:" / "DON'TS:" style headers
        if (Regex.IsMatch(line, @"^(DOS|DON[''\u2019]?TS|IMPORTANT NOTES|MAKING THE LISTINGS|IMPORTING PRODUCTS|COGS)\b", RegexOptions.IgnoreCase)) return true;
        return false;
    }

    private static string? DetectSection(string lower)
    {
        if (Regex.IsMatch(lower, @"don[''\u2019]?ts|important notes")) return "dont";
        if (Regex.IsMatch(lower, @"\bdos\b|best practice")) return "do";
        if (Regex.IsMatch(lower, @"cogs|price|discount")) return "pricing";
        if (Regex.IsMatch(lower, @"title|naming")) return "title";
        if (Regex.IsMatch(lower, @"description|listing")) return "desc";
        if (Regex.IsMatch(lower, @"tag|collection")) return "tag";
        if (Regex.IsMatch(lower, @"import")) return "skip"; // importing section = manual workflow
        return null;
    }

    /// <summary>
    /// Extracts a ChatGPT prompt block starting from a line that mentions "ChatGPT prompt".
    /// Collects following lines until a numbered step or blank line.
    /// </summary>
    private static string? ExtractPromptBlock(List<string> lines, ref int index)
    {
        var promptLines = new List<string>();

        // Start collecting from the next line
        index++;
        while (index < lines.Count)
        {
            var line = lines[index].Trim();
            // Stop at next numbered step or empty
            if (string.IsNullOrWhiteSpace(line)) break;
            if (Regex.IsMatch(line, @"^\d{1,2}[.)]\s")) { index--; break; }

            promptLines.Add(line);
            index++;
        }

        if (promptLines.Count == 0) return null;

        var prompt = string.Join(" ", promptLines);
        // Clean markdown
        prompt = Regex.Replace(prompt, @"\*{1,2}([^*]+)\*{1,2}", "$1");
        prompt = Regex.Replace(prompt, @"\s+", " ").Trim();

        return prompt.Length >= 20 ? prompt : null;
    }

    private static string Clean(string s)
    {
        // Remove bullet markers
        s = Regex.Replace(s, @"^[\s]*[○●▪▸►→\-\*]\s*", "");
        // Remove numbering
        s = Regex.Replace(s, @"^[\s]*\d{1,2}[.)]\s*", "");
        // Remove markdown
        s = Regex.Replace(s, @"\*{1,2}([^*]+)\*{1,2}", "$1");
        s = Regex.Replace(s, @"^#+\s*", "");
        // Strip wrapping (Note: ...) to just the content
        s = Regex.Replace(s, @"^\(Note:\s*(.+?)\)$", "$1");
        // Strip "EXAMPLE: ..." suffixes from rules
        s = Regex.Replace(s, @"\s*EXAMPLE:.*$", "", RegexOptions.IgnoreCase);
        // Strip trailing unclosed parentheses with just "Example" or "storename" etc
        s = Regex.Replace(s, @"\s*\(\s*$", "");
        // Strip "(VERY IMPORTANT)" annotations — the rule itself is the instruction
        s = Regex.Replace(s, @"\s*\(VERY IMPORTANT\)", "", RegexOptions.IgnoreCase);
        // Remove "12. " type number prefixes that survived earlier cleaning
        s = Regex.Replace(s, @"^\d{1,2}\.\s*", "");
        // Collapse whitespace
        s = Regex.Replace(s, @"\s+", " ");
        return s.Trim();
    }

    /// <summary>
    /// Returns true only if a rule is relevant for an AI agent that creates listings via API.
    /// Filters out: manual UI navigation, external tools, import steps, save/click actions.
    /// </summary>
    private static bool IsAgentRelevant(string s)
    {
        if (s.Length < 10 || s.Length > 300) return false;

        var lower = s.ToLowerInvariant();

        // ── SKIP: URLs ──
        if (Regex.IsMatch(lower, @"https?://|www\.|\.\w+\.com/")) return false;

        // ── SKIP: Manual UI actions — agent uses API, not a browser ──
        if (Regex.IsMatch(lower, @"\bclick\b|\bright-click\b|\bscroll\b|\bdrag\b|\bhover\b")) return false;
        if (Regex.IsMatch(lower, @"\bgo to\b.{0,20}\b(publishing|admin|dashboard|shopify|page|tab|menu)\b")) return false;
        if (Regex.IsMatch(lower, @"\bselect (all|your) (variant|product|channel)\b")) return false;
        if (Regex.IsMatch(lower, @"\bbulk edit\b|\bturn on everything\b|\bturn off\b")) return false;
        if (Regex.IsMatch(lower, @"\bredirected to\b|\bonce (you are|you're) in\b")) return false;
        if (Regex.IsMatch(lower, @"\blog\s?in\b|\bsign\s?in\b")) return false;
        if (Regex.IsMatch(lower, @"\bscreenshot\b")) return false;
        if (Regex.IsMatch(lower, @"\bdon'?t forget to (click|save)\b")) return false;
        if (Regex.IsMatch(lower, @"\bgo back to products?\b")) return false;
        if (Regex.IsMatch(lower, @"\bpreview on online store\b|\bdouble check everything\b")) return false;
        if (Regex.IsMatch(lower, @"\bfor the final check\b|\bbackend check\b|\btaking note of\b")) return false;

        // ── SKIP: External tools the agent doesn't use ──
        if (Regex.IsMatch(lower, @"\bpoky\b|\bcanva\b|\bgoogle sheets?\b|\bexcel\b|\bnotion\b")) return false;
        if (Regex.IsMatch(lower, @"\b(product listing|launch) sheet\b")) return false;
        if (Regex.IsMatch(lower, @"\bcompetitor link\b|\bcopy the competitor\b")) return false;

        // ── SKIP: Import/export steps (manual workflow) ──
        if (Regex.IsMatch(lower, @"\bimport product\b|\bimporting\b|\bpaste the.{0,15}link\b")) return false;

        // ── SKIP: Upload/download file actions ──
        if (Regex.IsMatch(lower, @"\bdownload the\b|\bupload the\b|\bsave the images\b")) return false;

        // ── SKIP: Intro/filler/meta ──
        if (Regex.IsMatch(lower, @"^(hi|hey|hello|welcome|i've sent|i've send)\b")) return false;
        if (Regex.IsMatch(lower, @"i want you to fully understand")) return false;
        if (Regex.IsMatch(lower, @"\brepeat this process\b")) return false;
        if (Regex.IsMatch(lower, @"^(tip|note|example)[:\s]")) return false;

        // ── SKIP: "lastly don't forget to add to our launch sheet" type lines ──
        if (Regex.IsMatch(lower, @"\b(add|put).{0,20}\b(sheet|spreadsheet|doc)\b")) return false;

        // ── SKIP: Pure section labels ──
        if (s.Length < 25 && s.EndsWith(':')) return false;

        // ── SKIP: Generic filler instructions ──
        if (Regex.IsMatch(lower, @"^always double check")) return false;
        if (Regex.IsMatch(lower, @"we do this to remove codes")) return false;

        return true;
    }

    private static void RouteRule(string rule, string? section,
        List<string> title, List<string> desc, List<string> pricing,
        List<string> tag, List<string> dont, List<string> product, List<string> general)
    {
        if (section == "skip") return; // e.g. "importing products" section

        var lower = rule.ToLowerInvariant();

        // Description/title format rules take priority — even if they contain "NEVER"
        if (Regex.IsMatch(lower, @"\bheadline\b|\bbullet point\b|\bparagraph\b|\bspacing\b.*\bformat\b|\bformat\b.*\bobserved\b|\bcapital letters\b.*\bbolded\b|\bpicture\b.*\b(description|always)\b|\bpicture\b.*\b(clear|small|800)\b"))
        { desc.Add(rule); return; }
        if (Regex.IsMatch(lower, @"\bfirst letter\b.*\bcapital\b"))
        { desc.Add(rule); return; }

        // Explicit don'ts
        if (Regex.IsMatch(lower, @"\bnever\b|\bdon[''\u2019]?t\b|\bdo not\b|\bno\s+(product |fake |brand )"))
        {
            dont.Add(rule);
            return;
        }

        // Route by current section first
        if (section == "dont") { dont.Add(rule); return; }
        if (section == "pricing") { pricing.Add(rule); return; }
        if (section == "title") { title.Add(rule); return; }
        if (section == "tag") { tag.Add(rule); return; }

        // Then by content keywords
        if (Regex.IsMatch(lower, @"\btitle\b|\bproduct name\b|\bnaming\b|title creation"))
        { title.Add(rule); return; }

        if (Regex.IsMatch(lower, @"\bheadline\b|\bdescription\b|\bbullet point\b|\bparagraph\b|\bh2\b|\bcapital letters\b.*\bbolded\b|\bspacing\b"))
        { desc.Add(rule); return; }

        if (Regex.IsMatch(lower, @"\bpric\w*\b|\bmargin\b|\bmarkup\b|\bdiscount\b|\bcogs\b|\bber\b|\bcost\b|\bcompare.at.price\b|4\.95|9\.95|€|\$"))
        { pricing.Add(rule); return; }

        if (Regex.IsMatch(lower, @"\btag\b|\bcollection\b|\btemplate\b"))
        { tag.Add(rule); return; }

        if (Regex.IsMatch(lower, @"\bvendor\b|\bproduct (category|type)\b|\bmetafield\b|\bsku\b|\bbarcode\b|\bcharge tax\b|\btrack quantity\b|\bsales channel\b|\bcolou?r\b.*\bsize\b|\b2xl\b|\bcolou?r\b.*instead"))
        { product.Add(rule); return; }

        general.Add(rule);
    }

    private static void AddCategory(List<SopRuleCategory> result, string name, string icon, List<string> rules)
    {
        var deduped = rules.Distinct(StringComparer.OrdinalIgnoreCase).Take(20).ToList();
        if (deduped.Count > 0)
            result.Add(new SopRuleCategory { Name = name, Icon = icon, Rules = deduped });
    }
}

public class SopParseResult
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public string? RawText { get; set; }
    public List<SopRuleCategory> Rules { get; set; } = [];

    public static SopParseResult Error(string message) =>
        new() { Success = false, ErrorMessage = message };
}

public class SopRuleCategory
{
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "book-open";
    public List<string> Rules { get; set; } = [];
}
