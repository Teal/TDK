define(["require", "exports", "/tdk/vendors/_uslug@1.0.4@uslug/index.js"], function (require, exports, toAnchor) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TOCManager = void 0;
    /** 表示一个目录管理器 */
    class TOCManager {
        /**
         * 初始化新的目录管理器
         * @param counter 生成计数器的回调函数
         * @param counterStart 开始计数的索引
         */
        constructor(counter = (counts, item) => item.level === 0 ? `${counts[counts.length - 1]}. ` : item.level === 1 ? `${counts[counts.length - 2]}.${counts[counts.length - 1]} ` : undefined, counterStart = 2) {
            /** 获取所有顶级目录项 */
            this.items = [];
            /** 当前每个缩进等级的容器 */
            this._containers = [this.items];
            /** 当前每个缩进等级的个数 */
            this._counts = [0];
            /** 所有用过的描点 */
            this._anchors = new Set();
            this.counter = counter;
            this.counterStart = counterStart;
        }
        /**
         * 添加一个目录项
         * @param label 目录的内容
         * @param level 目录的等级
         * @param anchor 自定义描点
         * @param counter 自定义计数器
         */
        add(label, level, anchor, counter) {
            var _a, _b;
            var _c;
            if (anchor === undefined) {
                anchor = this.addAnchor(label);
            }
            else {
                this._anchors.add(anchor);
            }
            const result = {
                level,
                label,
                anchor,
                counter
            };
            this._counts.length = this._containers.length = level + 1;
            // 第一次添加当前级别的项
            let container = this._containers[level];
            if (!container) {
                this._containers[level] = container = [];
                this._counts[level] = 0;
                for (let parentLevel = level - 1; parentLevel >= 0; parentLevel--) {
                    const parentContainer = this._containers[parentLevel];
                    // 如果上一次添加了 1 级目录，这次添加了 3 级目录，就会出现父级为空的情况
                    const parent = parentContainer === null || parentContainer === void 0 ? void 0 : parentContainer[parentContainer.length - 1];
                    if (parent) {
                        // 如果上一次添加了 1 级目录，然后依次添加 4 级目录和 3 级目录，就会出现父级已有子项的情况
                        if (parent.items) {
                            container.push(...parent.items);
                        }
                        parent.items = container;
                        break;
                    }
                }
            }
            const count = ++this._counts[level];
            // 生成计数器
            if (this.counter && count >= this.counterStart) {
                // 假如需求是仅当同级目录出现 2 次以上才生成计数器，那么在添加第 3 项时，先生成前 2 项的计数器
                if (count === this.counterStart) {
                    for (let i = 0; i < container.length; i++) {
                        this._counts[level] = i + 1;
                        (_a = (_c = container[i]).counter) !== null && _a !== void 0 ? _a : (_c.counter = this.counter(this._counts, container[i]));
                    }
                    this._counts[level] = count;
                }
                (_b = result.counter) !== null && _b !== void 0 ? _b : (result.counter = this.counter(this._counts, result));
            }
            container.push(result);
            return result;
        }
        /**
         * 添加一个新描点
         * @param label 原始文案
         */
        addAnchor(label) {
            let anchor = toAnchor(label);
            if (this._anchors.has(anchor)) {
                let postfix = 2;
                while (this._anchors.has(`${anchor}-${postfix}`)) {
                    postfix++;
                }
                anchor = `${anchor}-${postfix}`;
            }
            this._anchors.add(anchor);
            return anchor;
        }
        /**
         * 查找满足条件的第一个索引项，如果找不到返回 `undefined`
         * @param callback 判断是否满足条件的回调函数
         * @param parent 如果指定的根节点从只从指定节点范围查找
         */
        findItem(callback, parent = this) {
            for (const child of parent.items) {
                if (callback(child, parent)) {
                    return child;
                }
                if (child.items) {
                    const childResult = this.findItem(callback, child);
                    if (childResult) {
                        return childResult;
                    }
                }
            }
        }
        /**
         * 查找指定内容的描点
         * @param label 目录的内容
         */
        findAnchor(label) {
            var _a;
            return (_a = this.findItem(item => item.label === label)) === null || _a === void 0 ? void 0 : _a.anchor;
        }
        /**
         * 获取指定描点的文本内容
         * @param anchor 描点
         */
        findLabel(anchor) {
            var _a;
            return (_a = this.findItem(item => item.anchor === anchor)) === null || _a === void 0 ? void 0 : _a.label;
        }
        /**
         * 获取指定文案的描点
         * @param label 文案
         */
        toAnchor(label) {
            return toAnchor(label);
        }
    }
    exports.TOCManager = TOCManager;
});
//# sourceMappingURL=tocManager.js.map