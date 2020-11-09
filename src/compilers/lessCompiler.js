var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
define(["require", "exports", "/tdk/vendors/_less@3.12.2@less/index.js", "path"], function (require, exports, less_1, path_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    less_1 = __importDefault(less_1);
    async function default_1(content, path, outPath, builder) {
        var _a;
        try {
            const result = await less_1.default.render(content, {
                filename: path,
                paths: [builder.options.srcDir],
                async: true,
                fileAsync: true,
                rewriteUrls: "all",
                compress: false,
                ...builder.options.less,
                sourceMap: builder.options.sourceMap ? {
                    outputFilename: outPath,
                    sourceMapRootpath: builder.options.sourceMapRoot,
                    sourceMapBasepath: builder.options.sourceMapRoot === "file:///" ? undefined : path_1.dirname(outPath),
                    sourceMapURL: path_1.basename(outPath) + ".map",
                    ...(_a = builder.options.less) === null || _a === void 0 ? void 0 : _a.sourceMap
                } : undefined,
            });
            return {
                content: result.css,
                sourceMap: result.map,
                dependencies: result.imports
            };
        }
        catch (e) {
            return {
                errors: [{
                        message: e.message,
                        fileName: e.filename,
                        index: e.index,
                        line: e.line - 1,
                        column: e.column,
                        error: e
                    }]
            };
        }
    }
    exports.default = default_1;
});
//# sourceMappingURL=lessCompiler.js.map