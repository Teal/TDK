import * as yaml from "js-yaml";
/**
 * 解析一个 YAML 文件为 JSON 对象，如果无法解析则返回 `undefined`
 * @param content 要解析的内容
 */
export function parseYAML(content) {
    try {
        return yaml.safeLoad(content, {
            json: true
        });
    }
    catch (_a) { }
}
/**
 * 将 JSON 对象格式化为字符串，如果格式化失败则返回 `undefined`
 * @param obj 要格式化的对象
 */
export function formatYAML(obj) {
    try {
        return yaml.safeDump(obj, {
            lineWidth: Infinity
        });
    }
    catch (_a) { }
}
//# sourceMappingURL=yaml.js.map