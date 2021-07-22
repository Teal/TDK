# 编译器
可以配置不同扩展名对应的编译器，使得它们可以在浏览器执行。

目前 TDK 内置了 JavaScript、TypeScript、Sass(Scss)、Less、Markdown 的支持。

## JavaScript/TypeScript
项目中的 .js/.jsx/.ts/.tsx 都会使用 TypeScript 编译器转换为 ES6 代码。

> [i] 如果存在多个同名的文件，则按 .tsx > .ts > .jsx > .js 的顺序覆盖。

要配置编译器，建议在项目根目录新建 jsconfig.json 或 tsconfig.json，推荐的配置如下(假设源码全位于 components)：
```json
{
	"compilerOptions": {
		"outDir": "dist",
		"target": "es2018",
		"module": "commonjs",
		"sourceMap": true,
		"newLine": "LF",
		"jsx": "react",
		"useDefineForClassFields": false,
		"experimentalDecorators": true,
		"preserveConstEnums": true,
		"alwaysStrict": false,
		"esModuleInterop": true,
		"stripInternal": true,
		"moduleResolution": "node",
		"allowJs": true,
		"baseUrl": "./components",
		"paths": {
			"~/*": [
				"./*"
			]
		},
		"resolveJsonModule": true,
		"forceConsistentCasingInFileNames": true,
		"allowUmdGlobalAccess": true,
		"strict": true,
		"strictPropertyInitialization": false,
		"suppressImplicitAnyIndexErrors": true,
	}
}
```

这些配置对 VSCode 也生效。

如果不想增加单独的配置文件，也可以直接在 package.json 配置：
```json
{
	"tdk": {
		"ts": {
			/* 这里放配置项，配置的规则同 jsconfig/tsconfig 里的 compilerOptions */
		}
	}
}
```

为了使 JS 代码在文档演示这运行，系统会强制将模块编译为 AMD 模块，并使用内置的 AMD 加载器加载模块。

JS 中导入的模块解析规则同 [TypeScript](https://www.typescriptlang.org/docs/handbook/module-resolution.html)。
在组件库中，推荐使用 `import "~/button"` 的方式导入其它组件，其中 ~/ 是通过上述推荐配置实现的。

## Sass/Scss
项目中的 .sass/.scss 都会使用 [node-sass](https://www.npmjs.com/package/node-sass) 转换为 CSS 代码。

> [i] 后期我们可能改成使用 [sass](https://www.npmjs.com/package/sass) 来编译 SCSS 代码。

在 package.json 配置内置的编译器：
```json
{
	"tdk": {
		"sass": {
			"functions": {},              // 供 Sass 调用的自定义函数
			"includePaths": [],           // 解析 @import 的全局搜索目录，如 ["src/components"]，默认为 ["<项目根目录>"]
			"importer": undefined,        // 自定义解析 @import 地址的函数（(url: string, prev: string, done: (file: string, contents: string) => void) => string）

			"precision": 5,               // 设置计算得到的小数保留的小数位数，超过的部分将四舍五入
			"sourceComments": false,      // 保留源码中的注释
			"outputStyle": "expanded",    // 生成的 CSS 代码风格（"nested": 紧挨；"expanded": 展开；"compact": 紧凑；"compressed": 压缩）
			"indentType": "tab",	        // 缩进字符，可以是 "tab" 或 "space"
			"indentWidth": 2,             // 缩进字符的个数
			"linefeed": "cr",    	        // 换行符，可以是 "cr"、"lf"、"crlf" 或 "lfcr"
			"outFile": null,              // 生成文件的路径

			// 以下选项不建议修改
			"indentedSyntax": false,      // 使用 Lisp 风格的缩进语法
			"omitSourceMapUrl": true,     // 如果为 true 则不在文件末位追加 #SourceMappingURL
			"sourceMap": false,           // 是否生成源映射
			"sourceMapContents": false,   // 是否在源映射中包含源码
			"sourceMapEmbed": false,      // 是否在源码中包含源映射
			"sourceMapRoot": undefined,   // 源映射中的根路径
		}
	}
}
```

## Less
项目中的 .less 都会使用 [less-css](https://www.npmjs.com/package/less) 转换为 CSS 代码。

在 package.json 配置内置的编译器：
```json
{
	"tdk": {
		"less": {
			"functions": {},              // 供 Less 调用的自定义函数
			"globalVars": {},             // 供 Less 使用的全局变量（如 { var1: '"string value"'}，然后在 less 里使用 @var1）
			"modifyVars": {},             // 覆盖 Less 定义的全局变量（如 { var1: '"string value"'}，然后在 less 里使用 @var1）
			"paths": [],                  // 解析 @import 的全局搜索目录，如 ["src/components"]，默认为 ["<项目根目录>"]
			"rewriteUrls": "all",         // 重写 url() 中的地址（"all": 全部重写，"local"：仅重写 ./ 开头的路径，"off"：全部不重写）
			"urlArgs": "",				// 在地址后追加的字符串

			"env": "development",         // 生成环境（"development": 开发环境；"production"：生产环境）
			"logLevel": 2,                // 日志等级（0：不打印日志；1：仅打印错误；2：打印错误和信息）
			"poll": 1000,                 // 监听模式下的轮询等待毫秒数
			"dumpLineNumbers": null,      // 是否输出行号（"comments"：生成包含行号信息的注释）
			"rootpath": null,             // 最终引用 CSS 的根地址（如 "http://cdn.example.com/"）
			"useFileCache": true,         // 是否允许缓存已解析的文件
			"errorReporting": "console",  // 报告错误的方式（"console"：在控制台打印）

			// 以下选项不建议修改
			"async": false,               // 是否异步加载文件
			"sourceMap": true,            // 是否生成源映射
			"filename": "",               // 源文件名，用于解析相对路径
			"syncImport": true,           // 是否同步载入导入文件
			"compress": false,            // 是否压缩代码
			"fileAsync": false,           // 是否异步加载文件
		}
	}
}
```

## Markdown
项目中的 .md 都会使用内置的 Markdown 编译器转换为 HTML 代码。详见 {@link ./markdown-extension.md}。

## NPM 依赖
node_modules 中的依赖包会使用内置的 [Webpack](https://www.npmjs.com/package/webpack) 编译器打包成 AMD 模块。

在 package.json 配置内置的 Webpack：
```json
{
	"tdk": {
		"webpack": {
			/* 同 webpack.config.js 导出对象 */
		}
	}
}
```

## 自定义编译器
比如要配置支持 .vue 文件：

在 package.json 配置更多编译器：
```json
{
	"tdk": {
		"compilers": [
			{
				"inExt": [".vue"],
				"outExt": ".js",
				"use": "tdk-vue"
			}
		]
	}
}
```