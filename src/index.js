var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
define(["require", "exports", "./builder.js", "./configs.js", "./devServer.js"], function (require, exports, builder_1, configs_1, devServer_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(builder_1, exports);
    __exportStar(configs_1, exports);
    __exportStar(devServer_1, exports);
});
//# sourceMappingURL=index.js.map