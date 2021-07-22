import sass from "sass"
import { basename, dirname, join, normalize } from "path"
import { Builder, CompileResult } from "../builder"

export default async function (content: string, path: string, outPath: string, builder: Builder) {
	return new Promise<CompileResult>(resolve => {
		const paths: string[] = []
		paths.push(builder.options.srcDir)
		for (let prevDir = path, dir = dirname(prevDir); dir.length < prevDir.length; dir = dirname(prevDir = dir)) {
			if (/[\\/]node_modules$/i.test(dir)) {
				continue
			}
			paths.push(join(dir, "node_modules"))
		}
		sass.render({
			file: path,
			data: content,
			indentedSyntax: /\.sass$/i.test(path),
			sourceMap: builder.options.sourceMap,
			sourceMapRoot: builder.options.sourceMapRoot,
			outFile: builder.options.sourceMapRoot === "file:///" ? process.platform === "win32" ? `${outPath.startsWith("B") ? "A" : "B"}:\\${basename(outPath)}` : `/${basename(outPath)}` : outPath,
			outputStyle: "expanded",
			includePaths: paths,
			...builder.options.sass
		}, (error: any, result: any) => {
			if (error) {
				resolve({
					errors: [{
						message: error.message,
						fileName: error.file,
						line: error.line - 1,
						column: error.column - 1,
						error: error
					}]
				})
			} else {
				resolve({
					content: result.css,
					sourceMap: result.map,
					dependencies: result.stats.includedFiles.map(normalize)
				})
			}
		})
	})
}