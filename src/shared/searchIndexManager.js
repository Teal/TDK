define(["require", "exports", "./chinese.js"], function (require, exports, chinese_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SearchIndexItem = exports.SearchIndexManager = void 0;
    /** 表示一个搜索索引管理器 */
    class SearchIndexManager {
        constructor() {
            /** 获取所有索引项 */
            this.items = [];
            /** 获取所有内嵌的汉字拼音 */
            this.pinyins = {};
        }
        /**
         * 添加一个搜索项
         * @param title 标题
         * @param subtitle 副标题
         * @param url 地址
         * @param keywords 指定额外关键字
         */
        add(title, subtitle, url, keywords) {
            const item = {
                title,
                subtitle,
                url,
                keywords
            };
            this.items.push(item);
            this.addPinYin(title);
            if (subtitle)
                this.addPinYin(subtitle);
            if (keywords) {
                for (const keyword of keywords) {
                    this.addPinYin(keyword);
                }
            }
        }
        /**
         * 添加字符串中的中文拼音数据
         * @param value 要添加的字符串
         */
        addPinYin(value) {
            var _a;
            var _b;
            for (const char of value) {
                const pinyin = chinese_1.getPinYin(char);
                if (pinyin) {
                    (_a = (_b = this.pinyins)[char]) !== null && _a !== void 0 ? _a : (_b[char] = pinyin);
                }
            }
        }
    }
    exports.SearchIndexManager = SearchIndexManager;
    /** 表示一个搜索索引项 */
    class SearchIndexItem {
    }
    exports.SearchIndexItem = SearchIndexItem;
});
//# sourceMappingURL=searchIndexManager.js.map