import { parseYAML } from "./yaml";
/**
 * 解析 Markdown 的信息
 * @param content 要解析的内容
 */
export function parseMarkdownMeta(content) {
    var _a, _b, _c;
    const result = {};
    let header = "";
    const frontMatterMatch = /^\s*---\r?\n(.*?)\r?\n---\r?\n/s.exec(content);
    if (frontMatterMatch) {
        Object.assign(result, parseYAML(frontMatterMatch[1]));
        if (typeof result.name !== "string") {
            delete result.name;
        }
        if (typeof result.title !== "string") {
            delete result.title;
        }
        if (typeof result.subtitle !== "string") {
            delete result.subtitle;
        }
        if (result.description) {
            result.description = String(result.description);
        }
        else {
            delete result.description;
        }
        if (typeof result.state !== "string") {
            delete result.state;
        }
        if (result.tag) {
            if (typeof result.tag === "string") {
                result.tags = result.tag.split(/[,;\s\/\\\|]+/);
            }
            else if (Array.isArray(result.tag)) {
                result.tags = result.tag.map(String);
            }
            else {
                delete result.tags;
            }
        }
        else {
            delete result.tags;
        }
        if (result.keyword) {
            if (typeof result.keyword === "string") {
                result.keywords = result.keyword.split(/[,;\s\/\\\|]+/);
            }
            else if (Array.isArray(result.keyword)) {
                result.keywords = result.keyword.map(String);
            }
            else {
                delete result.keywords;
            }
        }
        else {
            delete result.keywords;
        }
        if (result.author) {
            const authors = (Array.isArray(result.author) ? result.author : [result.author]).map(author => {
                const match = author && /^\s*(.+)(?:\s*<(.+)>)?(?:\s*\((.+)\))?\s*$/.exec(author);
                if (match) {
                    return {
                        name: match[1],
                        email: match[2],
                        href: match[3] || (match[2] ? "mailto:" + match[2] : undefined)
                    };
                }
            }).filter(t => t);
            if (authors.length) {
                result.authors = authors;
            }
            else {
                delete result.authors;
            }
        }
        else {
            delete result.authors;
        }
        if (Array.isArray(result.changeLog)) {
            result.changeLogs = result.changeLog.map(String);
        }
        else {
            delete result.changeLogs;
        }
        header = content.substring(0, frontMatterMatch[0].length);
        content = content.substring(frontMatterMatch[0].length);
    }
    const h1Match = /^(\s*\r?\n)*(?:#(?!#)(.*)|(.*)\r?\n={3,}(?:\r?\n|$))/.exec(content);
    if (h1Match) {
        header += content.substring(0, h1Match[0].length);
        content = content.substring(h1Match[0].length);
        (_a = result.title) !== null && _a !== void 0 ? _a : (result.title = (_c = ((_b = h1Match[1]) !== null && _b !== void 0 ? _b : h1Match[2])) === null || _c === void 0 ? void 0 : _c.trim());
    }
    const spaceMatch = /^\s+/.exec(content);
    if (spaceMatch) {
        header += content.substring(0, spaceMatch[0].length);
        content = content.substring(spaceMatch[0].length);
    }
    result.header = header;
    result.body = content;
    return result;
}
//# sourceMappingURL=markdownMeta.js.map