var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
define(["require", "exports", "/tdk/vendors/_memory-fs@0.4.1@memory-fs/lib/MemoryFileSystem.js", "path", "/tdk/vendors/_webpack@5.2.0@webpack/lib/index.js"], function (require, exports, memory_fs_1, path_1, webpack_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    memory_fs_1 = __importDefault(memory_fs_1);
    webpack_1 = __importDefault(webpack_1);
    function default_1(content, path, outPath, builder) {
        return new Promise(resolve => {
            var _a;
            const wp = webpack_1.default({
                mode: builder.options.optimize ? "production" : "development",
                entry: path,
                context: path_1.dirname(path),
                ...builder.options.webpack,
                output: {
                    path: builder.options.baseDir,
                    filename: "&.js",
                    libraryTarget: "amd",
                    devtoolModuleFilenameTemplate: "npm://[namespace]/[resource-path]?[loaders]",
                    ...(_a = builder.options.webpack) === null || _a === void 0 ? void 0 : _a.output
                }
            });
            const fs = wp.outputFileSystem = new memory_fs_1.default();
            wp.run((err, stats) => {
                if (err) {
                    err.fileName = path;
                    resolve({
                        errors: [err]
                    });
                }
                else {
                    const distFile = path_1.resolve(builder.options.baseDir, "&.js");
                    if (!fs.existsSync(distFile) || stats.hasErrors()) {
                        for (const error of stats.compilation.errors) {
                            error.fileName = path;
                        }
                        resolve({
                            errors: stats.compilation.errors
                        });
                    }
                    else {
                        resolve({
                            content: fs.readFileSync(distFile)
                        });
                    }
                }
            });
        });
    }
    exports.default = default_1;
});
//# sourceMappingURL=externalPackageCompiler.js.map