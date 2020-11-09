define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseEmmet = void 0;
    /**
     * 解析一个简易的 CSS 选择器（如 `tag#id.class[attr=value]`）
     * @param value 要解析的内容
     * @param className 预定义的 CSS 类名
     */
    function parseEmmet(value, className = "") {
        var _a, _b;
        let tagName;
        let id;
        let props = "";
        value = ((_b = (_a = /\[[^'"\]]+\s*(?:=\s*(?:"[^"]*"|'[^']*'|[^\]]*))?\]|\{(.*)\}/.exec(value)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : value)
            .replace(/\[([^'"\]]+\s*(?:=\s*(?:"[^"]*"|'[^']*'|[^\]]*))?)\]/g, (all, prop) => {
            props += " " + prop;
            return "";
        }).replace(/\.([\w\-]+)/g, (all, value) => {
            if (className)
                className += " ";
            className += value;
            return "";
        }).replace(/#(\S+)/g, (all, value) => {
            props += ` id="${id = value}"`;
            return "";
        }).replace(/^[\w\-]+\b/, all => {
            tagName = all;
            return "";
        });
        return {
            tagName,
            id,
            className,
            props: className ? ` class="${className}"${props}` : props,
            rest: value
        };
    }
    exports.parseEmmet = parseEmmet;
});
//# sourceMappingURL=emmet.js.map