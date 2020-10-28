import MemoryFS from "memory-fs"
import { dirname, resolve as resolvePath } from "path"
import webpack from "webpack"
import { Builder } from "../builder"

export default function (content: string, path: string, outPath: string, builder: Builder) {
	return new Promise(resolve => {
		const wp = webpack({
			mode: builder.options.optimize ? "production" : "development",
			entry: path,
			context: dirname(path),
			...builder.options.webpack,
			output: {
				path: builder.options.baseDir,
				filename: "&.js",
				libraryTarget: "amd",
				devtoolModuleFilenameTemplate: "npm://[namespace]/[resource-path]?[loaders]",
				...builder.options.webpack?.output
			}
		})
		const fs = wp.outputFileSystem = new MemoryFS()
		wp.run((err: any, stats: any) => {
			if (err) {
				err.fileName = path
				resolve({
					errors: [err]
				})
			} else {
				const distFile = resolvePath(builder.options.baseDir, "&.js")
				if (!fs.existsSync(distFile) || stats.hasErrors()) {
					for (const error of stats.compilation.errors) {
						error.fileName = path
					}
					resolve({
						errors: stats.compilation.errors
					})
				} else {
					resolve({
						content: fs.readFileSync(distFile)
					})
				}
			}
		})
	})
}