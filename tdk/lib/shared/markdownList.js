/**
 * 解析 Markdown 语法的列表
 * @param content 要解析的内容
 */
export function parseMarkdownList(content) {
    var _a;
    const stack = [{
            indent: -1,
            children: []
        }];
    while (content) {
        const match = /^([ \t\u00A0]*)-\s+(\[[xX \u00A0]\]\s*)?(\[(.+)\]\((.+)\)|.*)\s*(?:\r\n?|\n|$)/.exec(content);
        if (!match) {
            break;
        }
        const [raw, indentString, checkedString, title1, title2, url] = match;
        const title = title2 !== null && title2 !== void 0 ? title2 : title1;
        const subtitleMatch = /^(.+)\((.+)\)$/.exec(title);
        const item = {
            raw: raw,
            indent: indentString.replace(/\t/g, "  ").length,
            checked: checkedString === undefined ? undefined : checkedString.includes("x") || checkedString.includes("X"),
            title: subtitleMatch ? subtitleMatch[1] : title,
            subtitle: subtitleMatch === null || subtitleMatch === void 0 ? void 0 : subtitleMatch[2],
            url: url
        };
        let stackTop = stack[stack.length - 1];
        while (item.indent <= stackTop.indent) {
            stack.pop();
            stackTop = stack[stack.length - 1];
        }
        (_a = stackTop.children) !== null && _a !== void 0 ? _a : (stackTop.children = []);
        stackTop.children.push(item);
        stack.push(item);
        content = content.substring(raw.length);
    }
    return {
        /** 已解析的列表 */
        items: stack[0].children,
        /** 剩余未解析的内容 */
        rest: content
    };
}
/**
 * 格式化 Markdown 语法的列表
 * @param items 要格式化的目录项
 * @param indent 使用的缩进字符串
 * @param prefix 在每行内容前插入的前缀
 */
export function formatMarkdownList(items, indent = "  ", prefix = "") {
    return items.map(item => {
        var _a;
        const checkedString = item.checked === true ? "[x] " : item.checked === false ? "[ ] " : "";
        const title = item.subtitle ? `${item.title}(${item.subtitle})` : item.title;
        const content = item.url === undefined ? title : `[${title}](${item.url})`;
        const children = ((_a = item.children) === null || _a === void 0 ? void 0 : _a.length) ? "\n" + formatMarkdownList(item.children, indent, prefix + indent) : "";
        return `${prefix}- ${checkedString}${content}${children}`;
    }).join("\n");
}
//# sourceMappingURL=markdownList.js.map