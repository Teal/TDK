namespace DOC {
	declare var define: Function
	declare var require: Function
	declare var QUnit: any

	/** 渲染单元测试 */
	export function renderUnitTest(modules: string[]) {
		define("/tdk/assert", [], function () {
			QUnit.assert.__esModule = true
			QUnit.assert.deepStrictEqual = QUnit.assert.deepEqual
			QUnit.assert.notDeepStrictEqual = QUnit.assert.notDeepEqual
			return QUnit.assert
		})
		const selectedModuleNames = typeof QUnit.urlParams.module === "string" ? [QUnit.urlParams.module] : Array.isArray(QUnit.urlParams.module) ? QUnit.urlParams.module : []
		let selectedModules = modules.filter(module => selectedModuleNames.includes(module))
		if (!selectedModules.length) {
			selectedModules = modules
		}
		require(selectedModules.map(module => DOC.pageData.baseURL + module), (...selectedModuleExports: any[]) => {
			for (const module of modules) {
				const selectedIndex = selectedModules.indexOf(module)
				if (selectedIndex >= 0) {
					QUnit.module(module, () => {
						registerTests(selectedModuleExports[selectedIndex])
					})
				} else {
					QUnit.module(module, () => {
						QUnit.test("Skipped", (assert: any) => {
							assert.expected(0)
						})
					})
				}
			}
			QUnit.start()
		})
	}

	function registerTests(exports: any) {
		for (const key in exports) {
			const value = exports[key]
			if (typeof value === "function") {
				switch (key) {
					case "before":
						QUnit.moduleStart(value)
						break
					case "after":
						QUnit.moduleDone(value)
						break
					case "beforeEach":
						QUnit.testStart(value)
						break
					case "afterEach":
						QUnit.testDone(value)
						break
					default:
						QUnit.test(key, value)
						break
				}
			} else if (typeof value === "object") {
				QUnit.module(key)
				registerTests(value)
			}
		}
	}
}