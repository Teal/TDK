define(["require", "exports", "/tdk/vendors/_prismjs@1.22.0@prismjs/prism.js", "/tdk/vendors/_prismjs@1.22.0@prismjs/components/index.js"], function (require, exports, Prism, loadLanguages) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.normalizeLanguage = exports.removeHighlightMarkers = exports.highlight = void 0;
    loadLanguages.silent = true;
    const currentContext = {
        classPrefix: "",
        highlightLine: false
    };
    Prism.hooks.add("wrap", env => {
        for (let i = 0; i < env.classes.length; i++) {
            env.classes[i] = currentContext.classPrefix + env.classes[i];
        }
        if (currentContext.highlightLine) {
            if (env.type !== "code-block") {
                env.content = env.content.replace(/\r?\n/g, br => {
                    let attributes = "";
                    for (const name in env.attributes) {
                        attributes += ` ${name}="${(env.attributes[name] || "").replace(/"/g, "&quot;")}"`;
                    }
                    return `</${env.tag}>${br}<${env.tag} class="${env.classes.join(" ")}"${attributes}>`;
                });
            }
        }
    });
    /**
     * 高亮指定的内容并返回一段 HTML
     * @param content 要高亮的内容
     * @param language 高亮的语法
     * @param classPrefix 自定义类名前缀
     */
    function highlight(content, language, classPrefix = "") {
        if (!(language in Prism.languages)) {
            loadLanguages(language);
        }
        const originalContent = content;
        content = removeHighlightMarkers(content);
        currentContext.classPrefix = classPrefix;
        currentContext.highlightLine = content.length !== originalContent.length;
        const grammer = Prism.languages[language];
        content = grammer ? Prism.highlight(content, grammer, language) : Prism.util.encode(content);
        if (currentContext.highlightLine) {
            // 如果一个 <span> 内部包含换行，拆成多行
            const lines = originalContent.split(/\r?\n/);
            content = content.split(/\r?\n/).map((line, index) => {
                const originalLine = lines[index];
                if (/^[\+\-\*][ \t]/.test(originalLine)) {
                    return `<span class="${classPrefix}${originalLine.startsWith("*") ? "highlight" : originalLine.startsWith("+") ? "inserted" : "deleted"}">${originalLine.startsWith("*") ? "" : originalLine[0]}${line}</span>`;
                }
                return line;
            }).join("\n");
        }
        return content;
    }
    exports.highlight = highlight;
    /**
     * 删除代码中的高亮注解
     * @param content 要高亮的内容
     */
    function removeHighlightMarkers(content) {
        return content.replace(/^[\+\-\*][ \t]|^\\[\+\-\*\\]/mg, all => {
            if (all.charCodeAt(1) === 32) {
                return "";
            }
            return all.charAt(1);
        });
    }
    exports.removeHighlightMarkers = removeHighlightMarkers;
    /**
     * 规范化语言名称
     * @param language 要使用的语言
     */
    function normalizeLanguage(language) {
        return { htm: "html", "javascript": "js", "typescript": "ts", "markdown": "md" }[language] || language;
    }
    exports.normalizeLanguage = normalizeLanguage;
});
//# sourceMappingURL=syntaxHighlighter.js.map