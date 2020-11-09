var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
define(["require", "exports", "/tdk/vendors/_node-sass@4.14.1@node-sass/lib/index.js", "path"], function (require, exports, node_sass_1, path_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    node_sass_1 = __importDefault(node_sass_1);
    async function default_1(content, path, outPath, builder) {
        return new Promise(resolve => {
            const paths = [];
            paths.push(builder.options.srcDir);
            for (let prevDir = path, dir = path_1.dirname(prevDir); dir.length < prevDir.length; dir = path_1.dirname(prevDir = dir)) {
                if (/[\\/]node_modules$/i.test(dir)) {
                    continue;
                }
                paths.push(path_1.join(dir, "node_modules"));
            }
            node_sass_1.default.render({
                file: path,
                data: content,
                indentedSyntax: /\.sass$/i.test(path),
                sourceMap: builder.options.sourceMap,
                sourceMapRoot: builder.options.sourceMapRoot,
                outFile: builder.options.sourceMapRoot === "file:///" ? process.platform === "win32" ? `${outPath.startsWith("B") ? "A" : "B"}:\\${path_1.basename(outPath)}` : `/${path_1.basename(outPath)}` : outPath,
                outputStyle: "expanded",
                includePaths: paths,
                ...builder.options.sass
            }, (error, result) => {
                if (error) {
                    resolve({
                        errors: [{
                                message: error.message,
                                fileName: error.file,
                                line: error.line - 1,
                                column: error.column - 1,
                                error: error
                            }]
                    });
                }
                else {
                    resolve({
                        content: result.css,
                        sourceMap: result.map,
                        dependencies: result.stats.includedFiles.map(path_1.normalize)
                    });
                }
            });
        });
    }
    exports.default = default_1;
});
//# sourceMappingURL=sassCompiler.js.map