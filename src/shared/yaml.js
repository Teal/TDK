var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
define(["require", "exports", "/tdk/vendors/_js-yaml@3.14.0@js-yaml/index.js"], function (require, exports, yaml) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatYAML = exports.parseYAML = void 0;
    yaml = __importStar(yaml);
    /**
     * 解析一个 YAML 文件为 JSON 对象，如果无法解析则返回 `undefined`
     * @param content 要解析的内容
     */
    function parseYAML(content) {
        try {
            return yaml.safeLoad(content, {
                json: true
            });
        }
        catch (_a) { }
    }
    exports.parseYAML = parseYAML;
    /**
     * 将 JSON 对象格式化为字符串，如果格式化失败则返回 `undefined`
     * @param obj 要格式化的对象
     */
    function formatYAML(obj) {
        try {
            return yaml.safeDump(obj, {
                lineWidth: Infinity
            });
        }
        catch (_a) { }
    }
    exports.formatYAML = formatYAML;
});
//# sourceMappingURL=yaml.js.map