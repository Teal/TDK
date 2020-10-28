import { resolve, relative } from "path"
import * as ts from "typescript"

/** 表示一个 TypeScript 文档解析器 */
export class TypeScriptDocParser {

	/** 获取正在解析的工程对象 */
	readonly program: ts.Program

	/** 获取正在使用的类型解析器 */
	readonly checker: ts.TypeChecker

	/**
	 * 初始化新的文档解析器
	 * @param program 要解析的工程对象
	 */
	constructor(program: ts.Program) {
		this.program = program
		this.checker = program.getTypeChecker()
	}

	/** 获取当前工程文件的所有入口文件 */
	getDocSourceFiles() {
		return this.program.getRootFileNames().map(name => {
			const sourceFile = this.program.getSourceFile(name)
			if (sourceFile) {
				return this.getDocSouceFile(sourceFile)
			}
		}).filter(sourceFile => sourceFile)
	}

	/**
	 * 解析一个源文件
	 * @param sourceFile 要解析的源文件
	 */
	getDocSouceFile(sourceFile: ts.SourceFile) {
		return this._parseCached(sourceFile, (sourceFile, result: DocSourceFile) => {
			result.path = sourceFile.fileName
			result.name = sourceFile.moduleName ?? sourceFile.fileName
			result.isDeclaration = sourceFile.isDeclarationFile
			result.isModule = ts.isExternalModule(sourceFile)
			result.imports = []
			result.members = []
			const firstJSDoc = this.getJSDocComments(sourceFile)[0]
			if (firstJSDoc?.tags) {
				for (const tag of firstJSDoc.tags) {
					switch (tag.tagName.text) {
						case "file":
						case "fileoverview":
							result.summary = concatComment(result.summary, tag.comment)
							break
						case "author":
							result.author = concatComment(result.author, tag.comment)
							break
						case "copyright":
							result.copyright = concatComment(result.copyright, tag.comment)
							break
						case "license":
						case "licence":
							result.license = concatComment(result.license, tag.comment)
							break
						case "module":
							result.isModule = true
							if (tag.comment) {
								result.name = tag.comment
							}
							break
						case "version":
						case "created":
						case "modified":
							result[tag.tagName.text] = tag.comment
							break
						default:
							const unknownTags = result.unknownTags ??= Object.create(null)
							unknownTags[tag.tagName.text] = concatComment(unknownTags[tag.tagName.text], tag.comment)
							break
					}
				}
			}
			sourceFile.resolvedModules?.forEach((resolvedModule, name) => {
				if (resolvedModule) {
					result.imports.push({
						name,
						resolvedModule
					})
				}
			})
			const symbol = this.checker.getSymbolAtLocation(sourceFile)
			if (symbol) {
				this.checker.getExportsOfModule(symbol).forEach(childSymbol => {
					result.members.push(this.getDocMember(childSymbol))
				})
			} else {
				sourceFile.locals?.forEach(childSymbol => {
					result.members.push(this.getDocMember(childSymbol))
				})
			}
			this.sortMembers(result.members)
			return result
		})
	}

	/**
	 * 解析节点关联的注释节点
	 * @param node 要解析的节点
	 * @param sourceFile 如果提供了节点所在的源文件，可以提升性能
	 */
	getJSDocComments(node: ts.Node, sourceFile = node.getSourceFile()) {
		return (ts.getLeadingCommentRanges(sourceFile.text, node.pos) ?? []).map(commentRange => (ts.parseIsolatedJSDocComment(sourceFile.text, commentRange.pos, commentRange.end - commentRange.pos) ?? {}).jsDoc).filter(jsDoc => jsDoc)
	}

	/**
	 * 解析一个成员
	 * @param symbol 引用成员的符号名称
	 */
	getDocMember(symbol: ts.Symbol) {
		return this._parseCached(symbol, (symbol, result: DocMember) => {
			const flags = symbol.getFlags()
			const declaration = symbol.valueDeclaration ?? symbol.getDeclarations()?.[0]
			// 动态生成的符号，比如 globalThis
			if (!declaration) {
				this.parseMemberBase<DocVariable>(symbol, symbol, declaration, DocMemberType.field, result)
				result.type = this.getDocType(this.checker.getTypeOfSymbolAtLocation(symbol, (symbol as any).bindingElement))
				return
			}
			// 函数/方法
			if (flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Method | ts.SymbolFlags.Constructor | ts.SymbolFlags.Signature)) {
				const declarations = symbol.getDeclarations().filter(declaration => declaration.kind !== ts.SyntaxKind.ModuleDeclaration && declaration.kind !== ts.SyntaxKind.InterfaceDeclaration) as ts.SignatureDeclaration[]
				const implementation = declarations.length <= 2 ? declarations.find(overload => !this.checker.isImplementationOfOverload(overload)) : declarations.find(overload => this.checker.isImplementationOfOverload(overload)) ?? declarations.find(overload => overload.kind === ts.SyntaxKind.FunctionDeclaration || overload.kind === ts.SyntaxKind.MethodDeclaration || overload.kind === ts.SyntaxKind.Constructor) ?? declarations[0]
				this.praseFunctionSignature(symbol, implementation, result)
				if (declarations.length > 2) {
					const overloads = result.overloads = []
					for (const declaration of declarations) {
						if (declaration !== implementation && declaration.parameters) {
							const overload = {} as DocFunction
							this.praseFunctionSignature(symbol, declaration, overload)
							overloads.push(overload)
						}
					}
					if (overloads.length) {
						const lastOverload = overloads[overloads.length - 1]
						for (const key in lastOverload) {
							if (result[key] === undefined) {
								result[key] = lastOverload[key]
							}
						}
					}
					if (overloads.length < 2) {
						delete result.overloads
					}
				}
				if (flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
					this.parseClassOrInterface(symbol, result.classOrInterface = {} as DocClassOrInterface)
				}
				if (flags & ts.SymbolFlags.Namespace) {
					this.parseNamespace(symbol, result.namespace = {} as DocNamespace)
				}
				return
			}
			// 变量/常量
			if (flags & ts.SymbolFlags.Variable) {
				// 如果变量类型包含构造函数，则该变量同类
				const type = this.checker.getTypeOfSymbolAtLocation(symbol, declaration)
				if (flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface) && this.checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length) {
					this.parseClassOrInterface(symbol, result)
					return
				}
				const nodeFlags = ts.getCombinedNodeFlags(declaration)
				this.parseMemberBase<DocVariable>(symbol, symbol, declaration, nodeFlags & ts.NodeFlags.Let ? DocMemberType.let : nodeFlags & ts.NodeFlags.Const ? DocMemberType.const : DocMemberType.var, result)
				if (nodeFlags & ts.NodeFlags.Const) result.modifiers |= DocMemberModifiers.readOnly
				result.type = this.getDocType(type)
				// 隐藏 module.exports
				if (declaration.kind === ts.SyntaxKind.Identifier && (declaration as any as ts.Identifier).text === "module") {
					result.ignore = true
				}
				return
			}
			// 类/接口
			if (flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
				this.parseClassOrInterface(symbol, result)
				return
			}
			// 字段
			if (flags & ts.SymbolFlags.Property) {
				const type = this.checker.getTypeOfSymbolAtLocation(symbol, declaration)
				this.parseMemberBase<DocVariable>(symbol, symbol, declaration, /^on[^a-z0-9]/.test(symbol.name) && this.checker.getSignaturesOfType(type, ts.SignatureKind.Call).length ? DocMemberType.event : DocMemberType.field, result)
				result.type = this.getDocType(type)
				if ((declaration as ts.PropertyDeclaration).initializer) {
					result.defaultValue = (declaration as ts.PropertyDeclaration).initializer
				}
				return
			}
			// 访问器
			if (flags & ts.SymbolFlags.Accessor) {
				const declaration = (symbol.valueDeclaration ?? symbol.getDeclarations()[0]) as ts.AccessorDeclaration
				this.parseMemberBase<DocVariable>(symbol, symbol, declaration, DocMemberType.accessor, result)
				if (!(symbol.getFlags() & ts.SymbolFlags.SetAccessor)) result.modifiers |= DocMemberModifiers.readOnly
				result.type = this.getDocType(this.checker.getTypeOfSymbolAtLocation(symbol, declaration))
				return
			}
			// 枚举成员
			if (flags & ts.SymbolFlags.EnumMember) {
				this.parseMemberBase<DocEnumMember>(symbol, symbol, declaration, DocMemberType.enumMember, result)
				result.defaultValue = this.checker.getConstantValue(declaration as ts.EnumMember)
				return
			}
			// 枚举
			if (flags & ts.SymbolFlags.Enum) {
				const declaration = symbol.getDeclarations().find(declaration => declaration.kind === ts.SyntaxKind.EnumDeclaration)
				this.parseMemberBase<DocEnum>(symbol, symbol, declaration, DocMemberType.enum, result)
				if (symbol.flags & ts.SymbolFlags.ConstEnum) result.modifiers |= DocMemberModifiers.readOnly
				result.declaredType = this.checker.getDeclaredTypeOfSymbol(symbol)
				result.members = this.checker.getExportsOfModule(symbol).map(childSymbol => this.getDocMember(childSymbol))
				return
			}
			// 类型别名
			if (flags & ts.SymbolFlags.TypeAlias) {
				const declaration = symbol.getDeclarations().find(declaration => declaration.kind === ts.SyntaxKind.TypeAliasDeclaration)
				this.parseMemberBase<DocTypeAlias>(symbol, symbol, declaration, DocMemberType.typeAlias, result)
				result.declaredType = this.checker.getDeclaredTypeOfSymbol(symbol)
				const type = this.getDocType(result.declaredType) as DocAliasType | DocGenericType
				Object.defineProperty(result, "aliasedType", {
					get() {
						return type.typeType === DocTypeType.typeAlias ? type.aliasedType : type.typeType === DocTypeType.generic && type.target.typeType === DocTypeType.typeAlias ? type.target.aliasedType : type
					},
					configurable: true,
					enumerable: true
				})
				return
			}
			// 命名空间
			if (flags & ts.SymbolFlags.NamespaceModule) {
				this.parseNamespace(symbol, result)
				return
			}
			// 导入别名
			if (flags & ts.SymbolFlags.Alias) {
				const target = this.checker.getAliasedSymbol(symbol)
				if (target.getFlags() & ts.SymbolFlags.ValueModule) {
					this.parseMemberBase<DocVariable>(symbol, symbol, declaration, DocMemberType.const, result)
					result.type = this.getDocType(this.checker.getTypeOfSymbolAtLocation(symbol, declaration))
					return
				}
				const aliasedMember = this.getDocMember(target)
				Object.assign(result, aliasedMember)
				result.raw = symbol
				return
			}
			// 模块
			if (flags & ts.SymbolFlags.ValueModule) {
				this.parseModule(symbol, result)
				return
			}
			// 不支持的成员
			this.parseMemberBase<DocUnknownMember>(symbol, symbol, declaration, DocMemberType.unknown, result)
		})
	}

	/**
	 * 解析成员基类
	 * @param symbolOrSignature 要解析的符号或签名
	 * @param symbol 要解析的符号
	 * @param declaration 要解析的的声明
	 * @param memberType 成员类型
	 * @param result 解析的结果
	 */
	protected parseMemberBase<T extends DocMember>(symbolOrSignature: ts.Symbol | ts.Signature, symbol: ts.Symbol, declaration: ts.Declaration | undefined, memberType: T["memberType"], result: DocMember): asserts result is T {
		result.memberType = memberType
		result.raw = symbol
		if (declaration) {
			result.declaration = declaration
			result.sourceLocation = this.getSourceLocation(declaration)
		}
		result.name = this.getSymbolName(symbol)
		result.id = this.getSymbolID(symbol)
		const modifierFlags = declaration ? ts.getCombinedModifierFlags(declaration) : 0
		if (modifierFlags & ts.ModifierFlags.Export) {
			result.modifiers |= DocMemberModifiers.export
			if (modifierFlags & ts.ModifierFlags.Default) result.modifiers |= DocMemberModifiers.exportDefault
			if ((declaration as ts.NamedDeclaration).name) {
				result.name = (declaration as ts.NamedDeclaration).name.getText()
			}
		}
		let accessiblity = result.name.startsWith("_") && (!result.name.startsWith("__") || result.name.endsWith("__")) ? DocMemberModifiers.internal : DocMemberModifiers.public
		if (modifierFlags & ts.ModifierFlags.Public) accessiblity = DocMemberModifiers.public
		if (modifierFlags & ts.ModifierFlags.Private || (declaration as ts.NamedDeclaration)?.name?.kind === ts.SyntaxKind.PrivateIdentifier) accessiblity = DocMemberModifiers.private
		if (modifierFlags & ts.ModifierFlags.Protected) accessiblity = DocMemberModifiers.protected
		if (modifierFlags & ts.ModifierFlags.Static) result.modifiers |= DocMemberModifiers.static
		if (modifierFlags & (ts.ModifierFlags.Readonly | ts.ModifierFlags.Const)) result.modifiers |= DocMemberModifiers.readOnly
		if (modifierFlags & ts.ModifierFlags.Abstract) result.modifiers |= DocMemberModifiers.abstract
		if (symbol.getFlags() & ts.SymbolFlags.Optional) result.modifiers |= DocMemberModifiers.optional
		result.summary = ts.displayPartsToString(symbolOrSignature.getDocumentationComment(this.checker))
		for (const tag of symbolOrSignature.getJsDocTags()) {
			switch (tag.name) {
				case "param":
				case "return":
				case "returns":
					break
				case "example":
					result.examples ??= []
					result.examples.push(tag.text)
					break
				case "see":
					result.seeAlso ??= []
					result.seeAlso.push(tag.text)
					break
				case "desc":
				case "description":
				case "remarks":
					result.description = concatComment(result.description, tag.text)
					break
				case "internal":
				case "package":
					accessiblity = DocMemberModifiers.internal
					if (tag.text) {
						result.summary = concatComment(result.summary, tag.text)
					}
					break
				case "ignore":
				case "hidden":
					result.ignore = true
					break
				case "since":
					result.since = concatComment(result.since, tag.text)
					break
				case "deprecated":
					result.modifiers |= DocMemberModifiers.deprecated
					if (tag.text) {
						result.deprecatedMessage = concatComment(result.deprecatedMessage, tag.text)
					}
					break
				case "default":
					result.defaultValue = tag.text
					break
				case "category":
					result.category = tag.text
					break
				case "summary":
					result.summary = concatComment(result.summary, tag.text)
					break
				case "experimental":
				case "beta":
					result.modifiers |= DocMemberModifiers.experimental
					break
				case "todo":
					result.ignore = true
					result.modifiers |= DocMemberModifiers.experimental
					break
				case "private":
					accessiblity = DocMemberModifiers.private
					if (tag.text) {
						result.summary = concatComment(result.summary, tag.text)
					}
					break
				case "protected":
					accessiblity = DocMemberModifiers.protected
					if (tag.text) {
						result.summary = concatComment(result.summary, tag.text)
					}
					break
				case "public":
					accessiblity = DocMemberModifiers.public
					if (tag.text) {
						result.summary = concatComment(result.summary, tag.text)
					}
					break
				case "access":
					switch (tag.text) {
						case "package":
						case "internal":
							accessiblity = DocMemberModifiers.internal
							break
						case "protected":
							accessiblity = DocMemberModifiers.protected
							break
						case "private":
							accessiblity = DocMemberModifiers.private
							break
						default:
							accessiblity = DocMemberModifiers.public
							break
					}
					break
				case "abstract":
					result.modifiers |= DocMemberModifiers.abstract
					break
				case "final":
				case "sealed":
					result.modifiers |= DocMemberModifiers.final
					break
				case "readonly":
					result.modifiers |= DocMemberModifiers.readOnly
					break
				case "name":
					result.name = tag.text
					break
				case "type":
				case "template":
				case "typeparam":
					break
				default:
					const unknownTags = result.unknownTags ??= Object.create(null)
					unknownTags[tag.name] = concatComment(unknownTags[tag.name], tag.text)
					break
			}
		}
		result.modifiers |= accessiblity
		const parent = this.getParentSymbol(symbol)
		if (parent) {
			result.parentMember = this.getDocMember(parent)
			// 查找覆盖的基类同名成员
			if (parent.getFlags() & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
				const parentType = this.checker.getDeclaredTypeOfSymbol(parent) as ts.InterfaceType
				for (const baseType of this.checker.getBaseTypes(parentType)) {
					const baseMember = this.findMember(baseType, symbol.getEscapedName())
					if (baseMember) {
						result.overridingMember = this.getDocMember(baseMember)
						if (result.overridingMember.modifiers & DocMemberModifiers.private) {
							result.overridingMember = undefined
							continue
						}
						// 从基类继承文档
						for (const key in result.overridingMember) {
							if (result[key] === undefined) {
								result[key] = result.overridingMember[key]
							}
						}
						break
					}
				}
			}
		}
	}

	/**
	 * 获取符号的名称
	 * @param symbol 要解析的符号
	 */
	getSymbolName(symbol: ts.Symbol) {
		const name = symbol.getName()
		if (name.startsWith("__")) {
			if (name === ts.InternalSymbolName.Call) {
				return "()"
			}
			if (name === ts.InternalSymbolName.Constructor) {
				return "new()"
			}
			if (name === ts.InternalSymbolName.Index) {
				return "[]"
			}
			const nameNode = (symbol.valueDeclaration as ts.NamedDeclaration)?.name
			if (nameNode && (nameNode.kind === ts.SyntaxKind.ObjectBindingPattern || nameNode.kind === ts.SyntaxKind.ArrayBindingPattern)) {
				return formatBindingPattern(nameNode)

				function formatBindingPattern(node: ts.ObjectBindingPattern | ts.ArrayBindingPattern) {
					let result = node.kind === ts.SyntaxKind.ObjectBindingPattern ? "{" : "["
					for (const element of node.elements) {
						if (element.kind === ts.SyntaxKind.BindingElement) {
							if (result.length > 1) result += ", "
							if (element.name.kind === ts.SyntaxKind.Identifier) {
								result += element.name.text
							} else {
								result += formatBindingPattern(element.name)
							}
						}
					}
					return result + (node.kind === ts.SyntaxKind.ObjectBindingPattern ? "}" : "]")
				}
			}
			return this.checker.symbolToString(symbol, undefined, undefined, ts.SymbolFormatFlags.None)
		}
		return name
	}

	/**
	 * 获取符号的唯一标识
	 * @param symbol 要解析的符号
	 */
	getSymbolID(symbol: ts.Symbol): string {
		const name = (symbol.escapedName as string).replace(/#/g, "@")
		const parent = this.getParentSymbol(symbol)
		if (parent) {
			return `${this.getSymbolID(parent)}.${name}`
		}
		return name
	}

	/**
	 * 获取定义指定符号的父符号
	 * @param symbol 要解析的符号
	 */
	getParentSymbol(symbol: ts.Symbol) {
		const parent = symbol.parent
		if (!parent || parent.valueDeclaration?.kind === ts.SyntaxKind.SourceFile) {
			return
		}
		return parent
	}

	/**
	 * 解析一个方法
	 * @param symbol 引用成员的符号名称
	 * @param declaration 当前重载的声明
	 * @param result 解析的结果
	 */
	protected praseFunctionSignature(symbol: ts.Symbol, declaration: ts.SignatureDeclaration, result: DocMember): asserts result is DocFunction {
		// JS 文件中通过直接赋值得到的函数定义不含参数
		if (!declaration.parameters) {
			this.parseMemberBase<DocFunction>(symbol, symbol, declaration, DocMemberType.function, result)
			const type = this.getDocType(this.checker.getTypeOfSymbolAtLocation(symbol, declaration))
			if (type.typeType === DocTypeType.function) {
				result.typeParameters = type.typeParameters
				result.parameters = type.parameters
				result.returnType = type.returnType
			} else {
				result.parameters = []
				result.returnType = type
			}
			result.returnSummary = ts.getJSDocReturnTag(declaration)?.comment
			return
		}
		const signature = this.checker.getSignatureFromDeclaration(declaration)
		const symbolFlags = symbol.getFlags()
		this.parseMemberBase<DocFunction>(signature, symbol, declaration, symbolFlags & ts.SymbolFlags.Method ? DocMemberType.method : symbolFlags & ts.SymbolFlags.Function ? DocMemberType.function : symbolFlags & ts.SymbolFlags.Constructor ? DocMemberType.constructor : symbol.getName() === ts.InternalSymbolName.Call ? DocMemberType.call : DocMemberType.index, result)
		const modifierFlags = ts.getCombinedModifierFlags(declaration)
		if (modifierFlags & ts.ModifierFlags.Async) result.modifiers |= DocMemberModifiers.async
		if ((declaration as ts.MethodDeclaration).asteriskToken) result.modifiers |= DocMemberModifiers.generator
		result.typeParameters = signature.getTypeParameters()?.map(typeParameter => this.parseTypeParameter(typeParameter))
		result.parameters = signature.getParameters().map(parameter => this.parseParameter(parameter))
		result.returnType = this.getDocType(this.checker.getReturnTypeOfSignature(signature))
		result.returnSummary = ts.getJSDocReturnTag(declaration)?.comment
		// 解析子参数
		for (const paramTag of ts.getAllJSDocTagsOfKind(declaration, ts.SyntaxKind.JSDocParameterTag) as ts.JSDocParameterTag[]) {
			if (paramTag.name.kind === ts.SyntaxKind.QualifiedName) {
				const name = paramTag.name.getText()
				const parameter = result.parameters.find(parameter => name.startsWith(parameter.name + "."))
				if (parameter) {
					parameter.subParameters ??= []
					parameter.subParameters.push({
						name: paramTag.name.right.text,
						optional: paramTag.isBracketed,
						type: paramTag.typeExpression ? this.getDocType(this.checker.getTypeFromTypeNode(paramTag.typeExpression)) : undefined,
						summary: paramTag.comment
					})
				}
			}
		}
	}

	/**
	 * 解析一个类型参数
	 * @param typeParameter 类型参数
	 */
	protected parseTypeParameter(typeParameter: ts.TypeParameter) {
		const symbol = typeParameter.getSymbol()
		const constraintType = this.checker.getBaseConstraintOfType(typeParameter)
		const defaultType = this.checker.getDefaultFromTypeParameter(typeParameter)
		const result: DocTypeParameter = {
			raw: typeParameter,
			name: symbol.getName(),
			summary: ts.displayPartsToString(symbol.getDocumentationComment(this.checker)),
			constraintType: constraintType && this.getDocType(constraintType),
			defaultType: defaultType && this.getDocType(defaultType)
		}
		return result
	}

	/**
	 * 解析一个参数
	 * @param symbol 参数的符号
	 */
	protected parseParameter(symbol: ts.Symbol) {
		const parameterDeclaration = symbol.valueDeclaration as ts.ParameterDeclaration
		const result: DocParameter = {
			raw: symbol,
			name: this.getSymbolName(symbol),
			summary: ts.displayPartsToString(symbol.getDocumentationComment(this.checker)),
			rest: !!parameterDeclaration?.dotDotDotToken,
			optional: !!parameterDeclaration?.questionToken || !!parameterDeclaration?.initializer,
			type: this.getDocType(this.checker.getTypeOfSymbolAtLocation(symbol, parameterDeclaration)),
			defaultValue: parameterDeclaration?.initializer
		}
		return result
	}

	/**
	 * 解析一个类或接口
	 * @param symbol 引用成员的符号名称
	 * @param result 解析的结果
	 */
	protected parseClassOrInterface(symbol: ts.Symbol, result: DocMember) {
		const declarations = symbol.getDeclarations()
		const implementation = (declarations.find(declaration => declaration.kind === ts.SyntaxKind.ClassDeclaration) ??
			this.findBestDeclaration(declarations.filter(declaration => declaration.kind === ts.SyntaxKind.InterfaceDeclaration)) ??
			declarations[0]) as ts.ClassDeclaration | ts.InterfaceDeclaration
		const staticType = this.checker.getTypeOfSymbolAtLocation(symbol, implementation)
		this.parseMemberBase<DocClassOrInterface>(symbol, symbol, implementation, symbol.getFlags() & ts.SymbolFlags.Class || this.checker.getSignaturesOfType(staticType, ts.SignatureKind.Construct).length ? DocMemberType.class : DocMemberType.interface, result)
		const type = result.declaredType = this.checker.getDeclaredTypeOfSymbol(symbol) as ts.InterfaceType
		result.typeParameters = type.typeParameters?.map(typeParameter => this.parseTypeParameter(typeParameter))
		result.extends = this.checker.getBaseTypes(type).map(baseType => this.getDocType(baseType))
		result.implements = ts.getHeritageClause(implementation, ts.SyntaxKind.ImplementsKeyword)?.types?.map(implementType => this.getDocType(this.checker.getTypeAtLocation(implementType.expression)))
		result.members = this.checker.getPropertiesOfType(type).map(property => setID(this.getDocMember(property)))
		const call = this.findMember(type, ts.InternalSymbolName.Call)
		if (call) {
			result.members.unshift(setID(this.getDocMember(call)))
		}
		const constructor = this.findMember(type, ts.InternalSymbolName.Constructor)
		if (constructor) {
			result.members.unshift(setID(this.getDocMember(constructor)))
		}
		const index = this.findMember(type, ts.InternalSymbolName.Index)
		if (index) {
			result.members.push(setID(this.getDocMember(index)))
		}
		this.sortMembers(result.members)
		// 复制静态成员
		const staticProperties = this.checker.getPropertiesOfType(staticType)
		for (const staticProperty of staticProperties) {
			if (staticProperty.getFlags() & ts.SymbolFlags.Prototype) {
				continue
			}
			let staticMember = this.getDocMember(staticProperty)
			if (symbol.getFlags() & ts.SymbolFlags.Variable) {
				staticMember = Object.create(staticMember) as DocMember
				staticMember.parentMember = result
				staticMember.id = result.id + "." + staticProperty.getEscapedName()
				staticMember.modifiers |= DocMemberModifiers.static
			}
			result.members.push(staticMember)
		}

		function setID(child: DocMember) {
			if (child.parentMember !== result) {
				const newObject = Object.create(child) as DocMember
				newObject.baseMember = child
				newObject.id = result.id + "." + child.raw.getEscapedName()
				return newObject
			}
			return child
		}
	}

	/**
	 * 查找注释最多的声明节点
	 * @param declarations 所有声明节点
	 */
	protected findBestDeclaration(declarations: ts.Declaration[]) {
		if (declarations.length < 2) {
			return declarations[0]
		}
		return declarations.reduce((x, y) => {
			const commentLength1 = x.getStart() - x.getFullStart()
			const commentLength2 = y.getStart() - y.getFullStart()
			return commentLength2 > commentLength1 ? y : x
		})
	}

	/**
	 * 在指定类型中查找成员
	 * @param type 要查找的类型
	 * @param escapedName 已编码的成员名
	 */
	protected findMember(type: ts.Type, escapedName: ts.__String): ts.Symbol {
		const thisMember = type.getSymbol()?.members?.get(escapedName)
		if (thisMember) {
			return thisMember
		}
		if (type.isClassOrInterface()) {
			for (const baseType of this.checker.getBaseTypes(type)) {
				const baseMember = this.findMember(baseType, escapedName)
				if (baseMember) {
					return baseMember
				}
			}
		}
	}

	/**
	 * 排序成员
	 * @param members 要排序的成员数组
	 */
	protected sortMembers(members: DocMember[]) {
		members.sort((x, y) => {
			if ((x.modifiers & DocMemberModifiers.private) !== (y.modifiers & DocMemberModifiers.private)) {
				return x.modifiers & DocMemberModifiers.private ? 1 : -1
			}
			if ((x.modifiers & DocMemberModifiers.internal) !== (y.modifiers & DocMemberModifiers.internal)) {
				return x.modifiers & DocMemberModifiers.internal ? 1 : -1
			}
			if ((x.modifiers & DocMemberModifiers.deprecated) !== (y.modifiers & DocMemberModifiers.deprecated)) {
				return x.modifiers & DocMemberModifiers.deprecated ? 1 : -1
			}
			if ((x.modifiers & DocMemberModifiers.protected) !== (y.modifiers & DocMemberModifiers.protected)) {
				return x.modifiers & DocMemberModifiers.protected ? 1 : -1
			}
			if ((x.modifiers & DocMemberModifiers.optional) !== (y.modifiers & DocMemberModifiers.optional)) {
				return x.modifiers & DocMemberModifiers.optional ? 1 : -1
			}
			if (x.sourceLocation && y.sourceLocation) {
				return x.sourceLocation.start - y.sourceLocation.start
			}
			if (!x.sourceLocation !== !y.sourceLocation) {
				return x.sourceLocation ? -1 : 1
			}
			return 0
		})
	}

	/**
	 * 解析一个命名空间
	 * @param symbol 引用成员的符号名称
	 * @param result 解析的结果
	 */
	protected parseNamespace(symbol: ts.Symbol, result: DocMember) {
		// 如果存在多个命名空间定义，选择注释最长的一个
		const declarations = symbol.getDeclarations().filter(declaration => declaration.kind === ts.SyntaxKind.ModuleDeclaration)
		if (!declarations.length) {
			declarations.push(symbol.getDeclarations()[0])
		}
		const declaration = this.findBestDeclaration(declarations)
		this.parseMemberBase<DocNamespace>(symbol, symbol, declaration, DocMemberType.namespace, result)
		result.members = this.checker.getExportsOfModule(symbol).map(childSymbol => this.getDocMember(childSymbol))
		this.sortMembers(result.members)
	}

	/**
	 * 解析一个模块
	 * @param symbol 引用成员的符号名称
	 * @param result 解析的结果
	 */
	protected parseModule(symbol: ts.Symbol, result: DocMember) {
		const declaration = symbol.getDeclarations()?.[0]
		this.parseMemberBase<DocNamespace>(symbol, symbol, declaration, DocMemberType.module, result)
		try {
			result.name = JSON.parse(result.name)
			result.name = relative(process.cwd(), result.name).replace(/\\/g, "/")
			result.name = `import(${JSON.stringify(result.name)})`
		} catch { }
		result.members = this.checker.getExportsOfModule(symbol).map(childSymbol => this.getDocMember(childSymbol))
		this.sortMembers(result.members)
	}

	/**
	 * 解析一个类型
	 * @param type 要解析的类型
	 */
	getDocType(type: ts.Type): DocType {
		return this._parseCached(type, (type, result: DocType) => {
			if (type.aliasSymbol) {
				if (type.aliasTypeArguments) {
					this.parseTypeBase<DocGenericType>(type, DocTypeType.generic, result)
					result.typeArguments = type.aliasTypeArguments.map(typeArgument => this.getDocType(typeArgument))
					result = result.target = {} as DocType
				}
				this.parseTypeBase<DocAliasType>(type, DocTypeType.typeAlias, result)
				result.member = this.getDocMember(type.aliasSymbol)
				result = result.aliasedType = {} as DocType
			}
			const flags = type.getFlags()
			// 原生基础类型
			if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never | ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean | ts.TypeFlags.BigInt | ts.TypeFlags.ESSymbol | ts.TypeFlags.NonPrimitive | ts.TypeFlags.BooleanLiteral)) {
				if ((type as ts.IntrinsicType).intrinsicName === "error") {
					this.parseTypeBase<DocUnknownType>(type, DocTypeType.error, result)
					return
				}
				this.parseTypeBase<DocNativeType>(type, DocTypeType.native, result)
				result.name = (type as ts.IntrinsicType).intrinsicName as DocNativeType["name"]
				return
			}
			// 枚举/枚举字面量
			if (flags & ts.TypeFlags.EnumLike) {
				this.parseTypeBase<DocReferenceType>(type, flags & ts.TypeFlags.Enum ? DocTypeType.enum : DocTypeType.enumMember, result)
				result.member = this.getDocMember(type.getSymbol())
				return
			}
			// 字面量
			if (flags & ts.TypeFlags.Literal) {
				const value = (type as ts.LiteralType).value
				// 数字字面量
				if (flags & ts.TypeFlags.NumberLiteral) {
					this.parseTypeBase<DocLiteralType>(type, DocTypeType.numberLiteral, result)
					result.value = String(value)
					return
				}
				// 字符串字面量
				if (flags & ts.TypeFlags.StringLiteral) {
					this.parseTypeBase<DocLiteralType>(type, DocTypeType.stringLiteral, result)
					result.value = value as string
					return
				}
				// 大整数字面量
				if (flags & ts.TypeFlags.BigIntLiteral) {
					this.parseTypeBase<DocLiteralType>(type, DocTypeType.bigintLiteral, result)
					const bigint = value as ts.PseudoBigInt
					result.value = `${bigint.negative ? "-" : ""}${bigint.base10Value}`
					return
				}
			}
			// 对象
			if (flags & ts.TypeFlags.Object) {
				const objectFlags = (type as ts.ObjectType).objectFlags
				// 类/接口
				if (objectFlags & ts.ObjectFlags.ClassOrInterface) {
					this.parseTypeBase<DocReferenceType>(type, objectFlags & ts.ObjectFlags.Class ? DocTypeType.class : DocTypeType.interface, result)
					result.member = this.getDocMember(type.getSymbol())
					return
				}
				// 泛型
				if (objectFlags & ts.ObjectFlags.Reference) {
					if (this.checker.isArrayType(type)) {
						this.parseTypeBase<DocArrayType>(type, DocTypeType.array, result)
						result.element = this.getDocType(this.checker.getElementTypeOfArrayType(type))
						return
					}
					if (this.checker.isTupleType(type)) {
						this.parseTypeBase<DocTupleType>(type, DocTypeType.tuple, result)
						result.elements = type.typeArguments.map(typeArgument => this.getDocType(typeArgument))
						return
					}
					this.parseTypeBase<DocGenericType>(type, DocTypeType.generic, result)
					result.target = this.getDocType((type as ts.TypeReference).target)
					result.typeArguments = (type as ts.TypeReference).typeArguments.map(typeArgument => this.getDocType(typeArgument))
					return
				}
				// 匿名对象
				if (objectFlags & ts.ObjectFlags.Anonymous) {
					// 引用其它符号
					const symbol = type.getSymbol()
					if (symbol?.getFlags() & (ts.SymbolFlags.NamespaceModule | ts.SymbolFlags.Method | ts.SymbolFlags.Function | ts.SymbolFlags.Class | ts.SymbolFlags.Enum) && (symbol.valueDeclaration as ts.NamedDeclaration)?.name && !(symbol.getFlags() & ts.SymbolFlags.ValueModule)) {
						this.parseTypeBase<DocTypeOfType>(type, DocTypeType.typeOf, result)
						result.member = this.getDocMember(symbol)
						return
					}
					const properties = this.checker.getPropertiesOfType(type)
					const stringIndexInfo = this.checker.getIndexInfoOfType(type, ts.IndexKind.String)
					const numberIndexInfo = this.checker.getIndexInfoOfType(type, ts.IndexKind.Number)
					const callSignatures = this.checker.getSignaturesOfType(type, ts.SignatureKind.Call)
					const constructSignatures = this.checker.getSignaturesOfType(type, ts.SignatureKind.Construct)
					if (!properties.length && !stringIndexInfo && !numberIndexInfo) {
						// 函数
						if (callSignatures.length === 1 && !constructSignatures.length) {
							this.parseTypeBase<DocFunctionType>(type, DocTypeType.function, result)
							const signature = result.signature = callSignatures[0]
							result.typeParameters = signature.typeParameters?.map(typeParameter => this.parseTypeParameter(typeParameter))
							result.parameters = signature.parameters.map(parameter => this.parseParameter(parameter))
							result.returnType = this.getDocType(this.checker.getReturnTypeOfSignature(signature))
							return
						}
						// 构造函数
						if (constructSignatures.length === 1 && !callSignatures.length) {
							this.parseTypeBase<DocFunctionType>(type, DocTypeType.constructor, result)
							const signature = result.signature = constructSignatures[0]
							result.parameters = signature.parameters.map(parameter => this.parseParameter(parameter))
							result.returnType = this.getDocType(this.checker.getReturnTypeOfSignature(signature))
							return
						}
					}
					// 对象字面量
					this.parseTypeBase<DocObjectType>(type, DocTypeType.object, result)
					result.members = properties.map(property => this.getDocMember(property))
					const index = symbol?.members?.get(ts.InternalSymbolName.Index)
					if (index) {
						result.members.push(this.getDocMember(index))
					}
					const call = symbol?.members?.get(ts.InternalSymbolName.Call)
					if (call) {
						result.members.unshift(this.getDocMember(call))
					}
					const constructor = symbol?.members?.get(ts.InternalSymbolName.Constructor)
					if (constructor) {
						result.members.unshift(this.getDocMember(constructor))
					}
					return
				}
			}
			// 并集/交集
			if (flags & ts.TypeFlags.UnionOrIntersection) {
				const nonOptional = this.checker.getNonOptionalType(type)
				if (nonOptional !== type) {
					Object.assign(result, this.getDocType(nonOptional))
					result.raw = type
					return
				}
				this.parseTypeBase<DocBinaryType>(type, flags & ts.TypeFlags.Union ? DocTypeType.union : DocTypeType.intersection, result)
				result.operands = (type as ts.UnionOrIntersectionType).types.map(type => this.getDocType(type))
				return
			}
			// 类型参数
			if (flags & ts.TypeFlags.TypeParameter) {
				this.parseTypeBase<DocReferenceType>(type, (type as any).thisType ? DocTypeType.this : DocTypeType.typeParameter, result)
				result.member = this.getDocMember(type.getSymbol())
				return
			}
			// 索引访问
			if (flags & ts.TypeFlags.IndexedAccess) {
				this.parseTypeBase<DocIndexedAccessType>(type, DocTypeType.indexedAccess, result)
				result.target = this.getDocType((type as ts.IndexedAccessType).objectType)
				result.key = this.getDocType((type as ts.IndexedAccessType).indexType)
				return
			}
			// 键查询
			if (flags & ts.TypeFlags.Index) {
				this.parseTypeBase<DocKeyOfType>(type, DocTypeType.keyOf, result)
				result.target = this.getDocType((type as ts.IndexType).type)
				return
			}
			// 条件
			if (flags & ts.TypeFlags.Conditional) {
				this.parseTypeBase<DocConditionalType>(type, DocTypeType.conditional, result)
				result.checkType = this.getDocType((type as ts.ConditionalType).checkType)
				result.extendsType = this.getDocType((type as ts.ConditionalType).extendsType)
				// HACK: 因为 TS 没有暴露 getTrueTypeFromConditionalType，只能利用一次计算结果
				this.checker.typeToTypeNode(type, undefined, ts.NodeBuilderFlags.InTypeAlias)
				result.trueType = this.getDocType((type as ts.ConditionalType).resolvedTrueType)
				result.falseType = this.getDocType((type as ts.ConditionalType).resolvedFalseType)
				return
			}
			// 唯一名称
			if (flags & ts.TypeFlags.UniqueESSymbol) {
				this.parseTypeBase<DocNativeType>(type, DocTypeType.native, result)
				result.name = "unique symbol"
				return
			}
			// 使用约束简化后的类型参数
			if (flags & ts.TypeFlags.Substitution) {
				Object.assign(result, this.getDocType((type as ts.SubstitutionType).baseType))
				result.raw = type
				return
			}
			// 模板字面量(4.1 新增)
			if (flags & ts.TypeFlags.TemplateLiteral) {
				this.parseTypeBase<DocTemplateLiteralType>(type, DocTypeType.templateLiteral, result)
				result.spans = []
				for (let i = 0; i < (type as ts.TemplateLiteralType).types.length; i++) {
					result.spans.push((type as ts.TemplateLiteralType).texts[i])
					result.spans.push(this.getDocType((type as ts.TemplateLiteralType).types[i]))
				}
				result.spans.push((type as ts.TemplateLiteralType).texts[(type as ts.TemplateLiteralType).texts.length - 1])
				return
			}
			// 不支持的类型
			this.parseTypeBase<DocUnknownType>(type, DocTypeType.unknown, result)
		})
	}

	/**
	 * 解析类型基类
	 * @param type 要解析的类型
	 * @param typeType 类型类型
	 * @param result 解析的结果
	 */
	protected parseTypeBase<T extends DocType>(type: ts.Type, typeType: T["typeType"], result: DocType): asserts result is T {
		result.typeType = typeType
		result.raw = type
	}

	/** 缓存键 */
	private static readonly _docKey: unique symbol = Symbol("doc")

	/** 解析数据并缓存 */
	private _parseCached<T, R extends { raw: T }>(node: T, parser: (node: T, result: R) => void) {
		const cached = node[TypeScriptDocParser._docKey]
		if (cached) {
			return cached as R
		}
		const result = node[TypeScriptDocParser._docKey] = {} as R
		parser(node, result)
		return result
	}

	/**
	 * 解析一个节点的源位置
	 * @param node 要解析的节点
	 * @param sourceFile 如果提供了节点所在的源文件，可以提升性能
	 */
	getSourceLocation(node: ts.Node, sourceFile = node.getSourceFile()): DocSourceLocation {
		const start = node.getStart(sourceFile, true)
		const end = node.getEnd()
		const startLoc = sourceFile.getLineAndCharacterOfPosition(start)
		const endLoc = sourceFile.getLineAndCharacterOfPosition(end)
		return {
			sourcePath: resolve(sourceFile.fileName),
			start,
			end,
			line: startLoc.line,
			column: startLoc.character,
			endLine: endLoc.line,
			endColumn: endLoc.character
		}
	}

	/**
	 * 获取类型的所有成员
	 * @param type 要解析的类型
	 */
	getPropertiesOfType(type: DocType) {
		return this.checker.getPropertiesOfType(type.raw).map(property => this.getDocMember(property))
	}

	/**
	 * 获取类型等价的字符串
	 * @param type 要解析的类型
	 */
	typeToString(type: DocType) {
		return this.checker.typeToString(type.raw)
	}

}

/** 合并同名的多个标签 */
function concatComment(comment1: string | undefined, comment2: string) {
	return comment1 ? comment1 + "\n" + comment2 : comment2
}

/** 表示一个源文件 */
export interface DocSourceFile {
	/** 原始文件对象 */
	raw: ts.SourceFile,
	/** 文件绝对路径 */
	path: string
	/** 模块名或文件名 */
	name: string
	/** 是否是声明文件（.d.ts） */
	isDeclaration?: boolean
	/** 是否是模块 */
	isModule?: boolean
	/** 所有导入项 */
	imports: DocImport[]
	/** 所有导出的成员 */
	members: DocMember[]
	/** 文件概述 */
	summary?: string
	/** 文件作者  */
	author?: string
	/** 版权声明 */
	copyright?: string
	/** 源码协议 */
	license?: string
	/** 文件版本号 */
	version?: string
	/** 创建时间 */
	created?: string
	/** 最后修改时间 */
	modified?: string
	/** 未识别的其它标签 */
	unknownTags?: { [key: string]: string }
}

/** 表示一个导入项 */
export interface DocImport {
	/** 导入的原始模块名 */
	name: string
	/** 解析后的模块信息 */
	resolvedModule: ts.ResolvedModule & {
		/** 解析后的绝对路径，如果模块解析失败则为 `undefined` */
		originalPath?: string;
	}
}

/** 表示一个成员 */
export type DocMember = DocUnknownMember | DocVariable | DocFunction | DocClassOrInterface | DocEnum | DocEnumMember | DocTypeAlias | DocNamespace

/** 表示成员类型的枚举 */
export const enum DocMemberType {
	/** 不支持的成员 */
	unknown = 0,
	/** 函数作用域变量 */
	var = 0b1,
	/** 块作用域变量 */
	let = 0b10,
	/** 常量 */
	const = 0b100,
	/** 函数 */
	function = 0b1000,
	/** 类 */
	class = 0b10000,
	/** 字段 */
	field = 0b100000,
	/** 访问器 */
	accessor = 0b1000000,
	/** 构造函数 */
	constructor = 0b10000000,
	/** 方法 */
	method = 0b100000000,
	/** 事件 */
	event = 0b1000000000,
	/** 索引器签名 */
	index = 0b10000000000,
	/** 函数调用签名 */
	call = 0b100000000000,
	/** 枚举 */
	enum = 0b1000000000000,
	/** 枚举成员 */
	enumMember = 0b10000000000000,
	/** 接口 */
	interface = 0b100000000000000,
	/** 类型别名 */
	typeAlias = 0b1000000000000000,
	/** 命名空间 */
	namespace = 0b10000000000000000,
	/** 模块 */
	module = 0b100000000000000000,
}

/** 表示一个成员基类 */
export interface DocMemberBase<T extends DocMemberType> {
	/** 成员的类型 */
	memberType: T
	/** 原始符号 */
	raw: ts.Symbol
	/** 原始声明节点 */
	declaration?: ts.Declaration
	/** 源码位置 */
	sourceLocation?: DocSourceLocation
	/** 成员的名字 */
	name: string
	/** 成员的唯一标识 */
	id: string
	/** 成员的修饰符 */
	modifiers: DocMemberModifiers
	/** 声明当前成员的容器成员 */
	parentMember?: DocMember
	/** 继承的父类成员 */
	baseMember?: DocMember
	/** 覆盖的父类同名成员 */
	overridingMember?: DocMember
	/** 是否忽略当前成员 */
	ignore?: boolean
	/** 废弃后的提示文案 */
	deprecatedMessage?: string
	/** 概述 */
	summary?: string
	/** 详细说明 */
	description?: string
	/** 示例 */
	examples?: string[]
	/** 参考列表 */
	seeAlso?: string[]
	/** 首次添加的版本号 */
	since?: string
	/** 所在分类 */
	category?: string
	/** 默认值 */
	defaultValue?: string | number | ts.Expression
	/** 未识别的其它标签 */
	unknownTags?: { [key: string]: string }
}

/** 表示成员修饰符 */
export const enum DocMemberModifiers {
	/** 是否导出 */
	export = 1 << 0,
	/** 是否默认导出 */
	exportDefault = 1 << 1,
	/** 是否公开 */
	public = 1 << 2,
	/** 是否私有 */
	private = 1 << 3,
	/** 是否保护 */
	protected = 1 << 4,
	/** 是否内部 */
	internal = 1 << 5,
	/** 可访问性修饰符 */
	accessiblity = DocMemberModifiers.public | DocMemberModifiers.private | DocMemberModifiers.protected | DocMemberModifiers.internal,
	/** 是否静态 */
	static = 1 << 6,
	/** 是否可选 */
	optional = 1 << 7,
	/** 是否只读 */
	readOnly = 1 << 8,
	/** 是否虚拟 */
	virtual = 1 << 9,
	/** 是否抽象 */
	abstract = 1 << 10,
	/** 是否密封 */
	final = 1 << 11,
	/** 是否是生成器 */
	generator = 1 << 12,
	/** 是否异步 */
	async = 1 << 13,
	/** 是否废弃 */
	deprecated = 1 << 14,
	/** 是否试验中 */
	experimental = 1 << 15,
}

/** 表示一个不支持的成员 */
export interface DocUnknownMember extends DocMemberBase<DocMemberType.unknown> { }

/** 表示一个变量、字段或访问器 */
export interface DocVariable extends DocMemberBase<DocMemberType.var | DocMemberType.let | DocMemberType.const | DocMemberType.field | DocMemberType.accessor | DocMemberType.event> {
	/** 值的类型 */
	type: DocType
}

/** 表示一个函数、方法、构造函数或索引器 */
export interface DocFunction extends DocMemberBase<DocMemberType.function | DocMemberType.method | DocMemberType.constructor | DocMemberType.index | DocMemberType.call> {
	/** 所有类型参数 */
	typeParameters?: DocTypeParameter[]
	/** 所有参数 */
	parameters: DocParameter[]
	/** 返回值类型 */
	returnType: DocType
	/** 返回值描述 */
	returnSummary?: string
	/** 方法的多个重载 */
	overloads?: Omit<DocFunction, "overloads" | "classOrInterface" | "namespace">[]
	/** 同名的类或接口 */
	classOrInterface?: DocClassOrInterface
	/** 同名的命名空间 */
	namespace?: DocNamespace
}

/** 表示一个类型参数 */
export interface DocTypeParameter {
	/** 原始符号 */
	raw: ts.TypeParameter
	/** 参数名 */
	name: string
	/** 概述 */
	summary?: string
	/** 约束类型 */
	constraintType?: DocType
	/** 默认类型 */
	defaultType?: DocType
}

/** 表示一个参数 */
export interface DocParameter {
	/** 原始符号 */
	raw: ts.Symbol
	/** 参数名 */
	name: string
	/** 概述 */
	summary?: string
	/** 是否是展开参数 */
	rest?: boolean
	/** 是否可选 */
	optional?: boolean
	/** 参数类型 */
	type: DocType
	/** 默认值 */
	defaultValue?: ts.Expression
	/** 所有子参数 */
	subParameters?: Omit<DocParameter, "raw">[]
}

/** 表示一个类或接口 */
export interface DocClassOrInterface extends DocMemberBase<DocMemberType.class | DocMemberType.interface> {
	/** 声明的类型 */
	declaredType: ts.Type
	/** 所有类型参数 */
	typeParameters?: DocTypeParameter[]
	/** 继承类型 */
	extends?: DocType[]
	/** 实现类型 */
	implements?: DocType[]
	/** 所有成员（含继承的成员） */
	members: DocMember[]
}

/** 表示一个枚举 */
export interface DocEnum extends DocMemberBase<DocMemberType.enum> {
	/** 声明的类型 */
	declaredType: ts.Type
	/** 所有枚举成员 */
	members: DocMember[]
}

/** 表示一个枚举成员 */
export interface DocEnumMember extends DocMemberBase<DocMemberType.enumMember> { }

/** 表示一个类型别名 */
export interface DocTypeAlias extends DocMemberBase<DocMemberType.typeAlias> {
	/** 声明的类型 */
	declaredType: ts.Type
	/** 等价的类型 */
	aliasedType: DocType
}

/** 表示一个命名空间 */
export interface DocNamespace extends DocMemberBase<DocMemberType.namespace | DocMemberType.module> {
	/** 所有导出的成员 */
	members: DocMember[]
}

/** 表示一个类型 */
export type DocType = DocUnknownType | DocNativeType | DocLiteralType | DocTemplateLiteralType | DocReferenceType | DocAliasType | DocGenericType | DocFunctionType | DocArrayType | DocTupleType | DocObjectType | DocKeyOfType | DocTypeOfType | DocIndexedAccessType | DocBinaryType | DocConditionalType

/** 表示类型类型的枚举 */
export const enum DocTypeType {
	/** 不支持的类型 */
	unknown = 0,
	/** 错误类型 */
	error = 0b1,
	/** 内置基础类型 */
	native = 0b10,
	/** 数字字面量类型 */
	numberLiteral = 0b100,
	/** 字符串字面量类型 */
	stringLiteral = 0b1000,
	/** 大整数字面量类型 */
	bigintLiteral = 0b10000,
	/** 模板字面量类型 */
	templateLiteral = 0b100000,
	/** 类 */
	class = 0b1000000,
	/** 接口 */
	interface = 0b10000000,
	/** 枚举 */
	enum = 0b100000000,
	/** 枚举成员 */
	enumMember = 0b1000000000,
	/** 别名类型 */
	typeAlias = 0b10000000000,
	/** 类型参数 */
	typeParameter = 0b100000000000,
	/** 当前类型引用类型 */
	this = 0b1000000000000,
	/** 泛型 */
	generic = 0b10000000000000,
	/** 函数类型 */
	function = 0b100000000000000,
	/** 构造函数类型 */
	constructor = 0b1000000000000000,
	/** 匿名对象类型 */
	object = 0b10000000000000000,
	/** 数组类型 */
	array = 0b100000000000000000,
	/** 元组类型 */
	tuple = 0b1000000000000000000,
	/** 键查询 */
	keyOf = 0b10000000000000000000,
	/** 类型查询 */
	typeOf = 0b100000000000000000000,
	/** 属性访问 */
	indexedAccess = 0b1000000000000000000000,
	/** 并集类型 */
	union = 0b10000000000000000000000,
	/** 交集类型 */
	intersection = 0b100000000000000000000000,
	/** 条件类型 */
	conditional = 0b1000000000000000000000000,
}

/** 表示一个类型 */
export interface DocTypeBase<T extends DocTypeType> {
	/** 类型的类型 */
	typeType: T
	/** 原始类型 */
	raw: ts.Type
}

/** 表示一个未知类型 */
export interface DocUnknownType extends DocTypeBase<DocTypeType.unknown | DocTypeType.error> { }

/** 表示一个内置类型 */
export interface DocNativeType extends DocTypeBase<DocTypeType.native> {
	/** 获取内置类型的名字 */
	name: "unknown" | "any" | "never" | "void" | "undefined" | "null" | "object" | "number" | "string" | "boolean" | "bigint" | "symbol" | "unique symbol" | "true" | "false"
}

/** 表示一个字面量类型 */
export interface DocLiteralType extends DocTypeBase<DocTypeType.numberLiteral | DocTypeType.stringLiteral | DocTypeType.bigintLiteral> {
	/** 类型的值 */
	value: string
}

/** 表示一个字面量类型 */
export interface DocTemplateLiteralType extends DocTypeBase<DocTypeType.templateLiteral> {
	/** 所有组成部分 */
	spans: (string | DocType)[]
}

/** 表示一个由符号声明的类型，比如类、接口、枚举或泛型参数 */
export interface DocReferenceType extends DocTypeBase<DocTypeType.class | DocTypeType.interface | DocTypeType.enum | DocTypeType.enumMember | DocTypeType.typeParameter | DocTypeType.this> {
	/** 关联的成员 */
	member: DocMember
}

/** 表示一个别名类型 */
export interface DocAliasType extends DocTypeBase<DocTypeType.typeAlias> {
	/** 关联的成员 */
	member: DocMember
	/** 等价的类型 */
	aliasedType: DocType
}

/** 表示一个泛型 */
export interface DocGenericType extends DocTypeBase<DocTypeType.generic> {
	/** 原类型 */
	target: DocType,
	/** 泛型形参 */
	typeArguments: DocType[]
}

/** 表示一个函数或构造函数类型 */
export interface DocFunctionType extends DocTypeBase<DocTypeType.function | DocTypeType.constructor> {
	/** 原始签名对象 */
	signature: ts.Signature
	/** 所有类型参数 */
	typeParameters?: DocTypeParameter[]
	/** 所有参数 */
	parameters: DocParameter[]
	/** 返回值类型 */
	returnType: DocType
}

/** 表示一个数组类型 */
export interface DocArrayType extends DocTypeBase<DocTypeType.array> {
	/** 元素 */
	element: DocType
}

/** 表示一个元组类型 */
export interface DocTupleType extends DocTypeBase<DocTypeType.tuple> {
	/** 元素 */
	elements: DocType[]
}

/** 表示一个匿名对象类型 */
export interface DocObjectType extends DocTypeBase<DocTypeType.object> {
	/** 获取所有成员 */
	members: DocMember[]
}

/** 表示一个键查询类型 */
export interface DocKeyOfType extends DocTypeBase<DocTypeType.keyOf> {
	/** 目标类型 */
	target: DocType
}

/** 表示一个类型查询类型 */
export interface DocTypeOfType extends DocTypeBase<DocTypeType.typeOf> {
	/** 查询的成员 */
	member: DocMember
}

/** 表示一个子属性访问类型 */
export interface DocIndexedAccessType extends DocTypeBase<DocTypeType.indexedAccess> {
	/** 目标类型 */
	target: DocType
	/** 访问的索引 */
	key: DocType
}

/** 表示一个双目类型 */
export interface DocBinaryType extends DocTypeBase<DocTypeType.union | DocTypeType.intersection> {
	/** 操作数 */
	operands: DocType[]
}

/** 表示一个条件类型 */
export interface DocConditionalType extends DocTypeBase<DocTypeType.conditional> {
	/** 检查类型 */
	checkType: DocType
	/** 测试的继承类型 */
	extendsType: DocType
	/** 测试结果为 `true` 的类型 */
	trueType: DocType
	/** 测试结果为 `false` 的类型 */
	falseType: DocType
}

/** 表示一个源码位置 */
export interface DocSourceLocation {
	/** 源文件绝对路径 */
	sourcePath: string
	/** 源文件中的开始索引(从 0 开始) */
	start: number
	/** 源文件中的结束索引(从 0 开始) */
	end: number
	/** 源文件中的开始行号(从 0 开始) */
	line: number
	/** 源文件中的开始列号(从 0 开始) */
	column: number
	/** 源文件中的结束行号(从 0 开始) */
	endLine: number
	/** 源文件中的结束列号(从 0 开始) */
	endColumn: number
}

declare module "typescript" {
	function parseIsolatedJSDocComment(content: string, start: number, length: number): { jsDoc?: JSDoc, diagnostics?: Diagnostic[] }
	interface SourceFile {
		resolvedModules?: ESMap<string, ResolvedModuleFull & { originalPath?: string }>
		locals?: ESMap<string, Symbol>
		identifiers?: ESMap<string, string>
	}
	function getHeritageClause(declaration: Declaration, type: SyntaxKind): { types: ExpressionWithTypeArguments[] }
	interface IntrinsicType extends Type {
		intrinsicName: string
	}
	interface TypeChecker {
		isArrayType(type: Type): type is TypeReference
		isTupleType(type: Type): type is TypeReference
		getElementTypeOfArrayType(type: TypeReference): Type
		getNonOptionalType(type: Type): Type
		getUnionType(types: Type[], reduce?: boolean): Type
	}
	interface Symbol {
		parent?: Symbol
	}
}