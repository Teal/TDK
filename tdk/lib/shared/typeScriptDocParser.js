import { resolve, relative } from "path";
import * as ts from "typescript";
/** 表示一个 TypeScript 文档解析器 */
export class TypeScriptDocParser {
    /**
     * 初始化新的文档解析器
     * @param program 要解析的工程对象
     */
    constructor(program) {
        this.program = program;
        this.checker = program.getTypeChecker();
    }
    /** 获取当前工程文件的所有入口文件 */
    getDocSourceFiles() {
        return this.program.getRootFileNames().map(name => {
            const sourceFile = this.program.getSourceFile(name);
            if (sourceFile) {
                return this.getDocSouceFile(sourceFile);
            }
        }).filter(sourceFile => sourceFile);
    }
    /**
     * 解析一个源文件
     * @param sourceFile 要解析的源文件
     */
    getDocSouceFile(sourceFile) {
        return this._parseCached(sourceFile, (sourceFile, result) => {
            var _a, _b, _c, _d;
            result.path = sourceFile.fileName;
            result.name = (_a = sourceFile.moduleName) !== null && _a !== void 0 ? _a : sourceFile.fileName;
            result.isDeclaration = sourceFile.isDeclarationFile;
            result.isModule = ts.isExternalModule(sourceFile);
            result.imports = [];
            result.members = [];
            const firstJSDoc = this.getJSDocComments(sourceFile)[0];
            if (firstJSDoc === null || firstJSDoc === void 0 ? void 0 : firstJSDoc.tags) {
                for (const tag of firstJSDoc.tags) {
                    switch (tag.tagName.text) {
                        case "file":
                        case "fileoverview":
                            result.summary = concatComment(result.summary, tag.comment);
                            break;
                        case "author":
                            result.author = concatComment(result.author, tag.comment);
                            break;
                        case "copyright":
                            result.copyright = concatComment(result.copyright, tag.comment);
                            break;
                        case "license":
                        case "licence":
                            result.license = concatComment(result.license, tag.comment);
                            break;
                        case "module":
                            result.isModule = true;
                            if (tag.comment) {
                                result.name = tag.comment;
                            }
                            break;
                        case "version":
                        case "created":
                        case "modified":
                            result[tag.tagName.text] = tag.comment;
                            break;
                        default:
                            const unknownTags = (_b = result.unknownTags) !== null && _b !== void 0 ? _b : (result.unknownTags = Object.create(null));
                            unknownTags[tag.tagName.text] = concatComment(unknownTags[tag.tagName.text], tag.comment);
                            break;
                    }
                }
            }
            (_c = sourceFile.resolvedModules) === null || _c === void 0 ? void 0 : _c.forEach((resolvedModule, name) => {
                if (resolvedModule) {
                    result.imports.push({
                        name,
                        resolvedModule
                    });
                }
            });
            const symbol = this.checker.getSymbolAtLocation(sourceFile);
            if (symbol) {
                this.checker.getExportsOfModule(symbol).forEach(childSymbol => {
                    result.members.push(this.getDocMember(childSymbol));
                });
            }
            else {
                (_d = sourceFile.locals) === null || _d === void 0 ? void 0 : _d.forEach(childSymbol => {
                    result.members.push(this.getDocMember(childSymbol));
                });
            }
            this.sortMembers(result.members);
            return result;
        });
    }
    /**
     * 解析节点关联的注释节点
     * @param node 要解析的节点
     * @param sourceFile 如果提供了节点所在的源文件，可以提升性能
     */
    getJSDocComments(node, sourceFile = node.getSourceFile()) {
        var _a;
        return ((_a = ts.getLeadingCommentRanges(sourceFile.text, node.pos)) !== null && _a !== void 0 ? _a : []).map(commentRange => { var _a; return ((_a = ts.parseIsolatedJSDocComment(sourceFile.text, commentRange.pos, commentRange.end - commentRange.pos)) !== null && _a !== void 0 ? _a : {}).jsDoc; }).filter(jsDoc => jsDoc);
    }
    /**
     * 解析一个成员
     * @param symbol 引用成员的符号名称
     */
    getDocMember(symbol) {
        return this._parseCached(symbol, (symbol, result) => {
            var _a, _b, _c, _d, _e;
            const flags = symbol.getFlags();
            const declaration = (_a = symbol.valueDeclaration) !== null && _a !== void 0 ? _a : (_b = symbol.getDeclarations()) === null || _b === void 0 ? void 0 : _b[0];
            // 动态生成的符号，比如 globalThis
            if (!declaration) {
                this.parseMemberBase(symbol, symbol, declaration, 32 /* field */, result);
                result.type = this.getDocType(this.checker.getTypeOfSymbolAtLocation(symbol, symbol.bindingElement));
                return;
            }
            // 函数/方法
            if (flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Method | ts.SymbolFlags.Constructor | ts.SymbolFlags.Signature)) {
                const declarations = symbol.getDeclarations().filter(declaration => declaration.kind !== ts.SyntaxKind.ModuleDeclaration && declaration.kind !== ts.SyntaxKind.InterfaceDeclaration);
                const implementation = declarations.length <= 2 ? declarations.find(overload => !this.checker.isImplementationOfOverload(overload)) : (_d = (_c = declarations.find(overload => this.checker.isImplementationOfOverload(overload))) !== null && _c !== void 0 ? _c : declarations.find(overload => overload.kind === ts.SyntaxKind.FunctionDeclaration || overload.kind === ts.SyntaxKind.MethodDeclaration || overload.kind === ts.SyntaxKind.Constructor)) !== null && _d !== void 0 ? _d : declarations[0];
                this.praseFunctionSignature(symbol, implementation, result);
                if (declarations.length > 2) {
                    const overloads = result.overloads = [];
                    for (const declaration of declarations) {
                        if (declaration !== implementation && declaration.parameters) {
                            const overload = {};
                            this.praseFunctionSignature(symbol, declaration, overload);
                            overloads.push(overload);
                        }
                    }
                    if (overloads.length) {
                        const lastOverload = overloads[overloads.length - 1];
                        for (const key in lastOverload) {
                            if (result[key] === undefined) {
                                result[key] = lastOverload[key];
                            }
                        }
                    }
                    if (overloads.length < 2) {
                        delete result.overloads;
                    }
                }
                if (flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
                    this.parseClassOrInterface(symbol, result.classOrInterface = {});
                }
                if (flags & ts.SymbolFlags.Namespace) {
                    this.parseNamespace(symbol, result.namespace = {});
                }
                return;
            }
            // 变量/常量
            if (flags & ts.SymbolFlags.Variable) {
                // 如果变量类型包含构造函数，则该变量同类
                const type = this.checker.getTypeOfSymbolAtLocation(symbol, declaration);
                if (flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface) && this.checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length) {
                    this.parseClassOrInterface(symbol, result);
                    return;
                }
                const nodeFlags = ts.getCombinedNodeFlags(declaration);
                this.parseMemberBase(symbol, symbol, declaration, nodeFlags & ts.NodeFlags.Let ? 2 /* let */ : nodeFlags & ts.NodeFlags.Const ? 4 /* const */ : 1 /* var */, result);
                if (nodeFlags & ts.NodeFlags.Const)
                    result.modifiers |= 256 /* readOnly */;
                result.type = this.getDocType(type);
                // 隐藏 module.exports
                if (declaration.kind === ts.SyntaxKind.Identifier && declaration.text === "module") {
                    result.ignore = true;
                }
                return;
            }
            // 类/接口
            if (flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
                this.parseClassOrInterface(symbol, result);
                return;
            }
            // 字段
            if (flags & ts.SymbolFlags.Property) {
                const type = this.checker.getTypeOfSymbolAtLocation(symbol, declaration);
                this.parseMemberBase(symbol, symbol, declaration, /^on[^a-z0-9]/.test(symbol.name) && this.checker.getSignaturesOfType(type, ts.SignatureKind.Call).length ? 512 /* event */ : 32 /* field */, result);
                result.type = this.getDocType(type);
                if (declaration.initializer) {
                    result.defaultValue = declaration.initializer;
                }
                return;
            }
            // 访问器
            if (flags & ts.SymbolFlags.Accessor) {
                const declaration = ((_e = symbol.valueDeclaration) !== null && _e !== void 0 ? _e : symbol.getDeclarations()[0]);
                this.parseMemberBase(symbol, symbol, declaration, 64 /* accessor */, result);
                if (!(symbol.getFlags() & ts.SymbolFlags.SetAccessor))
                    result.modifiers |= 256 /* readOnly */;
                result.type = this.getDocType(this.checker.getTypeOfSymbolAtLocation(symbol, declaration));
                return;
            }
            // 枚举成员
            if (flags & ts.SymbolFlags.EnumMember) {
                this.parseMemberBase(symbol, symbol, declaration, 8192 /* enumMember */, result);
                result.defaultValue = this.checker.getConstantValue(declaration);
                return;
            }
            // 枚举
            if (flags & ts.SymbolFlags.Enum) {
                const declaration = symbol.getDeclarations().find(declaration => declaration.kind === ts.SyntaxKind.EnumDeclaration);
                this.parseMemberBase(symbol, symbol, declaration, 4096 /* enum */, result);
                if (symbol.flags & ts.SymbolFlags.ConstEnum)
                    result.modifiers |= 256 /* readOnly */;
                result.declaredType = this.checker.getDeclaredTypeOfSymbol(symbol);
                result.members = this.checker.getExportsOfModule(symbol).map(childSymbol => this.getDocMember(childSymbol));
                return;
            }
            // 类型别名
            if (flags & ts.SymbolFlags.TypeAlias) {
                const declaration = symbol.getDeclarations().find(declaration => declaration.kind === ts.SyntaxKind.TypeAliasDeclaration);
                this.parseMemberBase(symbol, symbol, declaration, 32768 /* typeAlias */, result);
                result.declaredType = this.checker.getDeclaredTypeOfSymbol(symbol);
                const type = this.getDocType(result.declaredType);
                Object.defineProperty(result, "aliasedType", {
                    get() {
                        return type.typeType === 1024 /* typeAlias */ ? type.aliasedType : type.typeType === 8192 /* generic */ && type.target.typeType === 1024 /* typeAlias */ ? type.target.aliasedType : type;
                    },
                    configurable: true,
                    enumerable: true
                });
                return;
            }
            // 命名空间
            if (flags & ts.SymbolFlags.NamespaceModule) {
                this.parseNamespace(symbol, result);
                return;
            }
            // 导入别名
            if (flags & ts.SymbolFlags.Alias) {
                const target = this.checker.getAliasedSymbol(symbol);
                if (target.getFlags() & ts.SymbolFlags.ValueModule) {
                    this.parseMemberBase(symbol, symbol, declaration, 4 /* const */, result);
                    result.type = this.getDocType(this.checker.getTypeOfSymbolAtLocation(symbol, declaration));
                    return;
                }
                const aliasedMember = this.getDocMember(target);
                Object.assign(result, aliasedMember);
                result.raw = symbol;
                return;
            }
            // 模块
            if (flags & ts.SymbolFlags.ValueModule) {
                this.parseModule(symbol, result);
                return;
            }
            // 不支持的成员
            this.parseMemberBase(symbol, symbol, declaration, 0 /* unknown */, result);
        });
    }
    /**
     * 解析成员基类
     * @param symbolOrSignature 要解析的符号或签名
     * @param symbol 要解析的符号
     * @param declaration 要解析的的声明
     * @param memberType 成员类型
     * @param result 解析的结果
     */
    parseMemberBase(symbolOrSignature, symbol, declaration, memberType, result) {
        var _a, _b, _c, _d, _e;
        result.memberType = memberType;
        result.raw = symbol;
        if (declaration) {
            result.declaration = declaration;
            result.sourceLocation = this.getSourceLocation(declaration);
        }
        result.name = this.getSymbolName(symbol);
        result.id = this.getSymbolID(symbol);
        const modifierFlags = declaration ? ts.getCombinedModifierFlags(declaration) : 0;
        if (modifierFlags & ts.ModifierFlags.Export) {
            result.modifiers |= 1 /* export */;
            if (modifierFlags & ts.ModifierFlags.Default)
                result.modifiers |= 2 /* exportDefault */;
            if (declaration.name) {
                result.name = declaration.name.getText();
            }
        }
        let accessiblity = result.name.startsWith("_") && (!result.name.startsWith("__") || result.name.endsWith("__")) ? 32 /* internal */ : 4 /* public */;
        if (modifierFlags & ts.ModifierFlags.Public)
            accessiblity = 4 /* public */;
        if (modifierFlags & ts.ModifierFlags.Private || ((_b = (_a = declaration) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.kind) === ts.SyntaxKind.PrivateIdentifier)
            accessiblity = 8 /* private */;
        if (modifierFlags & ts.ModifierFlags.Protected)
            accessiblity = 16 /* protected */;
        if (modifierFlags & ts.ModifierFlags.Static)
            result.modifiers |= 64 /* static */;
        if (modifierFlags & (ts.ModifierFlags.Readonly | ts.ModifierFlags.Const))
            result.modifiers |= 256 /* readOnly */;
        if (modifierFlags & ts.ModifierFlags.Abstract)
            result.modifiers |= 1024 /* abstract */;
        if (symbol.getFlags() & ts.SymbolFlags.Optional)
            result.modifiers |= 128 /* optional */;
        result.summary = ts.displayPartsToString(symbolOrSignature.getDocumentationComment(this.checker));
        for (const tag of symbolOrSignature.getJsDocTags()) {
            switch (tag.name) {
                case "param":
                case "return":
                case "returns":
                    break;
                case "example":
                    (_c = result.examples) !== null && _c !== void 0 ? _c : (result.examples = []);
                    result.examples.push(tag.text);
                    break;
                case "see":
                    (_d = result.seeAlso) !== null && _d !== void 0 ? _d : (result.seeAlso = []);
                    result.seeAlso.push(tag.text);
                    break;
                case "desc":
                case "description":
                case "remarks":
                    result.description = concatComment(result.description, tag.text);
                    break;
                case "internal":
                case "package":
                    accessiblity = 32 /* internal */;
                    if (tag.text) {
                        result.summary = concatComment(result.summary, tag.text);
                    }
                    break;
                case "ignore":
                case "hidden":
                    result.ignore = true;
                    break;
                case "since":
                    result.since = concatComment(result.since, tag.text);
                    break;
                case "deprecated":
                    result.modifiers |= 16384 /* deprecated */;
                    if (tag.text) {
                        result.deprecatedMessage = concatComment(result.deprecatedMessage, tag.text);
                    }
                    break;
                case "default":
                    result.defaultValue = tag.text;
                    break;
                case "category":
                    result.category = tag.text;
                    break;
                case "summary":
                    result.summary = concatComment(result.summary, tag.text);
                    break;
                case "experimental":
                case "beta":
                    result.modifiers |= 32768 /* experimental */;
                    break;
                case "todo":
                    result.ignore = true;
                    result.modifiers |= 32768 /* experimental */;
                    break;
                case "private":
                    accessiblity = 8 /* private */;
                    if (tag.text) {
                        result.summary = concatComment(result.summary, tag.text);
                    }
                    break;
                case "protected":
                    accessiblity = 16 /* protected */;
                    if (tag.text) {
                        result.summary = concatComment(result.summary, tag.text);
                    }
                    break;
                case "public":
                    accessiblity = 4 /* public */;
                    if (tag.text) {
                        result.summary = concatComment(result.summary, tag.text);
                    }
                    break;
                case "access":
                    switch (tag.text) {
                        case "package":
                        case "internal":
                            accessiblity = 32 /* internal */;
                            break;
                        case "protected":
                            accessiblity = 16 /* protected */;
                            break;
                        case "private":
                            accessiblity = 8 /* private */;
                            break;
                        default:
                            accessiblity = 4 /* public */;
                            break;
                    }
                    break;
                case "abstract":
                    result.modifiers |= 1024 /* abstract */;
                    break;
                case "final":
                case "sealed":
                    result.modifiers |= 2048 /* final */;
                    break;
                case "readonly":
                    result.modifiers |= 256 /* readOnly */;
                    break;
                case "name":
                    result.name = tag.text;
                    break;
                case "type":
                case "template":
                case "typeparam":
                    break;
                default:
                    const unknownTags = (_e = result.unknownTags) !== null && _e !== void 0 ? _e : (result.unknownTags = Object.create(null));
                    unknownTags[tag.name] = concatComment(unknownTags[tag.name], tag.text);
                    break;
            }
        }
        result.modifiers |= accessiblity;
        const parent = this.getParentSymbol(symbol);
        if (parent) {
            result.parentMember = this.getDocMember(parent);
            // 查找覆盖的基类同名成员
            if (parent.getFlags() & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
                const parentType = this.checker.getDeclaredTypeOfSymbol(parent);
                for (const baseType of this.checker.getBaseTypes(parentType)) {
                    const baseMember = this.findMember(baseType, symbol.getEscapedName());
                    if (baseMember) {
                        result.overridingMember = this.getDocMember(baseMember);
                        if (result.overridingMember.modifiers & 8 /* private */) {
                            result.overridingMember = undefined;
                            continue;
                        }
                        // 从基类继承文档
                        for (const key in result.overridingMember) {
                            if (result[key] === undefined) {
                                result[key] = result.overridingMember[key];
                            }
                        }
                        break;
                    }
                }
            }
        }
    }
    /**
     * 获取符号的名称
     * @param symbol 要解析的符号
     */
    getSymbolName(symbol) {
        var _a;
        const name = symbol.getName();
        if (name.startsWith("__")) {
            if (name === ts.InternalSymbolName.Call) {
                return "()";
            }
            if (name === ts.InternalSymbolName.Constructor) {
                return "new()";
            }
            if (name === ts.InternalSymbolName.Index) {
                return "[]";
            }
            const nameNode = (_a = symbol.valueDeclaration) === null || _a === void 0 ? void 0 : _a.name;
            if (nameNode && (nameNode.kind === ts.SyntaxKind.ObjectBindingPattern || nameNode.kind === ts.SyntaxKind.ArrayBindingPattern)) {
                return formatBindingPattern(nameNode);
                function formatBindingPattern(node) {
                    let result = node.kind === ts.SyntaxKind.ObjectBindingPattern ? "{" : "[";
                    for (const element of node.elements) {
                        if (element.kind === ts.SyntaxKind.BindingElement) {
                            if (result.length > 1)
                                result += ", ";
                            if (element.name.kind === ts.SyntaxKind.Identifier) {
                                result += element.name.text;
                            }
                            else {
                                result += formatBindingPattern(element.name);
                            }
                        }
                    }
                    return result + (node.kind === ts.SyntaxKind.ObjectBindingPattern ? "}" : "]");
                }
            }
            return this.checker.symbolToString(symbol, undefined, undefined, ts.SymbolFormatFlags.None);
        }
        return name;
    }
    /**
     * 获取符号的唯一标识
     * @param symbol 要解析的符号
     */
    getSymbolID(symbol) {
        const name = symbol.escapedName.replace(/#/g, "@");
        const parent = this.getParentSymbol(symbol);
        if (parent) {
            return `${this.getSymbolID(parent)}.${name}`;
        }
        return name;
    }
    /**
     * 获取定义指定符号的父符号
     * @param symbol 要解析的符号
     */
    getParentSymbol(symbol) {
        var _a;
        const parent = symbol.parent;
        if (!parent || ((_a = parent.valueDeclaration) === null || _a === void 0 ? void 0 : _a.kind) === ts.SyntaxKind.SourceFile) {
            return;
        }
        return parent;
    }
    /**
     * 解析一个方法
     * @param symbol 引用成员的符号名称
     * @param declaration 当前重载的声明
     * @param result 解析的结果
     */
    praseFunctionSignature(symbol, declaration, result) {
        var _a, _b, _c, _d;
        // JS 文件中通过直接赋值得到的函数定义不含参数
        if (!declaration.parameters) {
            this.parseMemberBase(symbol, symbol, declaration, 8 /* function */, result);
            const type = this.getDocType(this.checker.getTypeOfSymbolAtLocation(symbol, declaration));
            if (type.typeType === 16384 /* function */) {
                result.typeParameters = type.typeParameters;
                result.parameters = type.parameters;
                result.returnType = type.returnType;
            }
            else {
                result.parameters = [];
                result.returnType = type;
            }
            result.returnSummary = (_a = ts.getJSDocReturnTag(declaration)) === null || _a === void 0 ? void 0 : _a.comment;
            return;
        }
        const signature = this.checker.getSignatureFromDeclaration(declaration);
        const symbolFlags = symbol.getFlags();
        this.parseMemberBase(signature, symbol, declaration, symbolFlags & ts.SymbolFlags.Method ? 256 /* method */ : symbolFlags & ts.SymbolFlags.Function ? 8 /* function */ : symbolFlags & ts.SymbolFlags.Constructor ? 128 /* constructor */ : symbol.getName() === ts.InternalSymbolName.Call ? 2048 /* call */ : 1024 /* index */, result);
        const modifierFlags = ts.getCombinedModifierFlags(declaration);
        if (modifierFlags & ts.ModifierFlags.Async)
            result.modifiers |= 8192 /* async */;
        if (declaration.asteriskToken)
            result.modifiers |= 4096 /* generator */;
        result.typeParameters = (_b = signature.getTypeParameters()) === null || _b === void 0 ? void 0 : _b.map(typeParameter => this.parseTypeParameter(typeParameter));
        result.parameters = signature.getParameters().map(parameter => this.parseParameter(parameter));
        result.returnType = this.getDocType(this.checker.getReturnTypeOfSignature(signature));
        result.returnSummary = (_c = ts.getJSDocReturnTag(declaration)) === null || _c === void 0 ? void 0 : _c.comment;
        // 解析子参数
        for (const paramTag of ts.getAllJSDocTagsOfKind(declaration, ts.SyntaxKind.JSDocParameterTag)) {
            if (paramTag.name.kind === ts.SyntaxKind.QualifiedName) {
                const name = paramTag.name.getText();
                const parameter = result.parameters.find(parameter => name.startsWith(parameter.name + "."));
                if (parameter) {
                    (_d = parameter.subParameters) !== null && _d !== void 0 ? _d : (parameter.subParameters = []);
                    parameter.subParameters.push({
                        name: paramTag.name.right.text,
                        optional: paramTag.isBracketed,
                        type: paramTag.typeExpression ? this.getDocType(this.checker.getTypeFromTypeNode(paramTag.typeExpression)) : undefined,
                        summary: paramTag.comment
                    });
                }
            }
        }
    }
    /**
     * 解析一个类型参数
     * @param typeParameter 类型参数
     */
    parseTypeParameter(typeParameter) {
        const symbol = typeParameter.getSymbol();
        const constraintType = this.checker.getBaseConstraintOfType(typeParameter);
        const defaultType = this.checker.getDefaultFromTypeParameter(typeParameter);
        const result = {
            raw: typeParameter,
            name: symbol.getName(),
            summary: ts.displayPartsToString(symbol.getDocumentationComment(this.checker)),
            constraintType: constraintType && this.getDocType(constraintType),
            defaultType: defaultType && this.getDocType(defaultType)
        };
        return result;
    }
    /**
     * 解析一个参数
     * @param symbol 参数的符号
     */
    parseParameter(symbol) {
        const parameterDeclaration = symbol.valueDeclaration;
        const result = {
            raw: symbol,
            name: this.getSymbolName(symbol),
            summary: ts.displayPartsToString(symbol.getDocumentationComment(this.checker)),
            rest: !!(parameterDeclaration === null || parameterDeclaration === void 0 ? void 0 : parameterDeclaration.dotDotDotToken),
            optional: !!(parameterDeclaration === null || parameterDeclaration === void 0 ? void 0 : parameterDeclaration.questionToken) || !!(parameterDeclaration === null || parameterDeclaration === void 0 ? void 0 : parameterDeclaration.initializer),
            type: this.getDocType(this.checker.getTypeOfSymbolAtLocation(symbol, parameterDeclaration)),
            defaultValue: parameterDeclaration === null || parameterDeclaration === void 0 ? void 0 : parameterDeclaration.initializer
        };
        return result;
    }
    /**
     * 解析一个类或接口
     * @param symbol 引用成员的符号名称
     * @param result 解析的结果
     */
    parseClassOrInterface(symbol, result) {
        var _a, _b, _c, _d, _e;
        const declarations = symbol.getDeclarations();
        const implementation = ((_b = (_a = declarations.find(declaration => declaration.kind === ts.SyntaxKind.ClassDeclaration)) !== null && _a !== void 0 ? _a : this.findBestDeclaration(declarations.filter(declaration => declaration.kind === ts.SyntaxKind.InterfaceDeclaration))) !== null && _b !== void 0 ? _b : declarations[0]);
        const staticType = this.checker.getTypeOfSymbolAtLocation(symbol, implementation);
        this.parseMemberBase(symbol, symbol, implementation, symbol.getFlags() & ts.SymbolFlags.Class || this.checker.getSignaturesOfType(staticType, ts.SignatureKind.Construct).length ? 16 /* class */ : 16384 /* interface */, result);
        const type = result.declaredType = this.checker.getDeclaredTypeOfSymbol(symbol);
        result.typeParameters = (_c = type.typeParameters) === null || _c === void 0 ? void 0 : _c.map(typeParameter => this.parseTypeParameter(typeParameter));
        result.extends = this.checker.getBaseTypes(type).map(baseType => this.getDocType(baseType));
        result.implements = (_e = (_d = ts.getHeritageClause(implementation, ts.SyntaxKind.ImplementsKeyword)) === null || _d === void 0 ? void 0 : _d.types) === null || _e === void 0 ? void 0 : _e.map(implementType => this.getDocType(this.checker.getTypeAtLocation(implementType.expression)));
        result.members = this.checker.getPropertiesOfType(type).map(property => setID(this.getDocMember(property)));
        const call = this.findMember(type, ts.InternalSymbolName.Call);
        if (call) {
            result.members.unshift(setID(this.getDocMember(call)));
        }
        const constructor = this.findMember(type, ts.InternalSymbolName.Constructor);
        if (constructor) {
            result.members.unshift(setID(this.getDocMember(constructor)));
        }
        const index = this.findMember(type, ts.InternalSymbolName.Index);
        if (index) {
            result.members.push(setID(this.getDocMember(index)));
        }
        this.sortMembers(result.members);
        // 复制静态成员
        const staticProperties = this.checker.getPropertiesOfType(staticType);
        for (const staticProperty of staticProperties) {
            if (staticProperty.getFlags() & ts.SymbolFlags.Prototype) {
                continue;
            }
            let staticMember = this.getDocMember(staticProperty);
            if (symbol.getFlags() & ts.SymbolFlags.Variable) {
                staticMember = Object.create(staticMember);
                staticMember.parentMember = result;
                staticMember.id = result.id + "." + staticProperty.getEscapedName();
                staticMember.modifiers |= 64 /* static */;
            }
            result.members.push(staticMember);
        }
        function setID(child) {
            if (child.parentMember !== result) {
                const newObject = Object.create(child);
                newObject.baseMember = child;
                newObject.id = result.id + "." + child.raw.getEscapedName();
                return newObject;
            }
            return child;
        }
    }
    /**
     * 查找注释最多的声明节点
     * @param declarations 所有声明节点
     */
    findBestDeclaration(declarations) {
        if (declarations.length < 2) {
            return declarations[0];
        }
        return declarations.reduce((x, y) => {
            const commentLength1 = x.getStart() - x.getFullStart();
            const commentLength2 = y.getStart() - y.getFullStart();
            return commentLength2 > commentLength1 ? y : x;
        });
    }
    /**
     * 在指定类型中查找成员
     * @param type 要查找的类型
     * @param escapedName 已编码的成员名
     */
    findMember(type, escapedName) {
        var _a, _b;
        const thisMember = (_b = (_a = type.getSymbol()) === null || _a === void 0 ? void 0 : _a.members) === null || _b === void 0 ? void 0 : _b.get(escapedName);
        if (thisMember) {
            return thisMember;
        }
        if (type.isClassOrInterface()) {
            for (const baseType of this.checker.getBaseTypes(type)) {
                const baseMember = this.findMember(baseType, escapedName);
                if (baseMember) {
                    return baseMember;
                }
            }
        }
    }
    /**
     * 排序成员
     * @param members 要排序的成员数组
     */
    sortMembers(members) {
        members.sort((x, y) => {
            if ((x.modifiers & 8 /* private */) !== (y.modifiers & 8 /* private */)) {
                return x.modifiers & 8 /* private */ ? 1 : -1;
            }
            if ((x.modifiers & 32 /* internal */) !== (y.modifiers & 32 /* internal */)) {
                return x.modifiers & 32 /* internal */ ? 1 : -1;
            }
            if ((x.modifiers & 16384 /* deprecated */) !== (y.modifiers & 16384 /* deprecated */)) {
                return x.modifiers & 16384 /* deprecated */ ? 1 : -1;
            }
            if ((x.modifiers & 16 /* protected */) !== (y.modifiers & 16 /* protected */)) {
                return x.modifiers & 16 /* protected */ ? 1 : -1;
            }
            if ((x.modifiers & 128 /* optional */) !== (y.modifiers & 128 /* optional */)) {
                return x.modifiers & 128 /* optional */ ? 1 : -1;
            }
            if (x.sourceLocation && y.sourceLocation) {
                return x.sourceLocation.start - y.sourceLocation.start;
            }
            if (!x.sourceLocation !== !y.sourceLocation) {
                return x.sourceLocation ? -1 : 1;
            }
            return 0;
        });
    }
    /**
     * 解析一个命名空间
     * @param symbol 引用成员的符号名称
     * @param result 解析的结果
     */
    parseNamespace(symbol, result) {
        // 如果存在多个命名空间定义，选择注释最长的一个
        const declarations = symbol.getDeclarations().filter(declaration => declaration.kind === ts.SyntaxKind.ModuleDeclaration);
        if (!declarations.length) {
            declarations.push(symbol.getDeclarations()[0]);
        }
        const declaration = this.findBestDeclaration(declarations);
        this.parseMemberBase(symbol, symbol, declaration, 65536 /* namespace */, result);
        result.members = this.checker.getExportsOfModule(symbol).map(childSymbol => this.getDocMember(childSymbol));
        this.sortMembers(result.members);
    }
    /**
     * 解析一个模块
     * @param symbol 引用成员的符号名称
     * @param result 解析的结果
     */
    parseModule(symbol, result) {
        var _a;
        const declaration = (_a = symbol.getDeclarations()) === null || _a === void 0 ? void 0 : _a[0];
        this.parseMemberBase(symbol, symbol, declaration, 131072 /* module */, result);
        try {
            result.name = JSON.parse(result.name);
            result.name = relative(process.cwd(), result.name).replace(/\\/g, "/");
            result.name = `import(${JSON.stringify(result.name)})`;
        }
        catch (_b) { }
        result.members = this.checker.getExportsOfModule(symbol).map(childSymbol => this.getDocMember(childSymbol));
        this.sortMembers(result.members);
    }
    /**
     * 解析一个类型
     * @param type 要解析的类型
     */
    getDocType(type) {
        return this._parseCached(type, (type, result) => {
            var _a, _b, _c, _d, _e;
            if (type.aliasSymbol) {
                if (type.aliasTypeArguments) {
                    this.parseTypeBase(type, 8192 /* generic */, result);
                    result.typeArguments = type.aliasTypeArguments.map(typeArgument => this.getDocType(typeArgument));
                    result = result.target = {};
                }
                this.parseTypeBase(type, 1024 /* typeAlias */, result);
                result.member = this.getDocMember(type.aliasSymbol);
                result = result.aliasedType = {};
            }
            const flags = type.getFlags();
            // 原生基础类型
            if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never | ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean | ts.TypeFlags.BigInt | ts.TypeFlags.ESSymbol | ts.TypeFlags.NonPrimitive | ts.TypeFlags.BooleanLiteral)) {
                if (type.intrinsicName === "error") {
                    this.parseTypeBase(type, 1 /* error */, result);
                    return;
                }
                this.parseTypeBase(type, 2 /* native */, result);
                result.name = type.intrinsicName;
                return;
            }
            // 枚举/枚举字面量
            if (flags & ts.TypeFlags.EnumLike) {
                this.parseTypeBase(type, flags & ts.TypeFlags.Enum ? 256 /* enum */ : 512 /* enumMember */, result);
                result.member = this.getDocMember(type.getSymbol());
                return;
            }
            // 字面量
            if (flags & ts.TypeFlags.Literal) {
                const value = type.value;
                // 数字字面量
                if (flags & ts.TypeFlags.NumberLiteral) {
                    this.parseTypeBase(type, 4 /* numberLiteral */, result);
                    result.value = String(value);
                    return;
                }
                // 字符串字面量
                if (flags & ts.TypeFlags.StringLiteral) {
                    this.parseTypeBase(type, 8 /* stringLiteral */, result);
                    result.value = value;
                    return;
                }
                // 大整数字面量
                if (flags & ts.TypeFlags.BigIntLiteral) {
                    this.parseTypeBase(type, 16 /* bigintLiteral */, result);
                    const bigint = value;
                    result.value = `${bigint.negative ? "-" : ""}${bigint.base10Value}`;
                    return;
                }
            }
            // 对象
            if (flags & ts.TypeFlags.Object) {
                const objectFlags = type.objectFlags;
                // 类/接口
                if (objectFlags & ts.ObjectFlags.ClassOrInterface) {
                    this.parseTypeBase(type, objectFlags & ts.ObjectFlags.Class ? 64 /* class */ : 128 /* interface */, result);
                    result.member = this.getDocMember(type.getSymbol());
                    return;
                }
                // 泛型
                if (objectFlags & ts.ObjectFlags.Reference) {
                    if (this.checker.isArrayType(type)) {
                        this.parseTypeBase(type, 131072 /* array */, result);
                        result.element = this.getDocType(this.checker.getElementTypeOfArrayType(type));
                        return;
                    }
                    if (this.checker.isTupleType(type)) {
                        this.parseTypeBase(type, 262144 /* tuple */, result);
                        result.elements = type.typeArguments.map(typeArgument => this.getDocType(typeArgument));
                        return;
                    }
                    this.parseTypeBase(type, 8192 /* generic */, result);
                    result.target = this.getDocType(type.target);
                    result.typeArguments = type.typeArguments.map(typeArgument => this.getDocType(typeArgument));
                    return;
                }
                // 匿名对象
                if (objectFlags & ts.ObjectFlags.Anonymous) {
                    // 引用其它符号
                    const symbol = type.getSymbol();
                    if ((symbol === null || symbol === void 0 ? void 0 : symbol.getFlags()) & (ts.SymbolFlags.NamespaceModule | ts.SymbolFlags.Method | ts.SymbolFlags.Function | ts.SymbolFlags.Class | ts.SymbolFlags.Enum) && ((_a = symbol.valueDeclaration) === null || _a === void 0 ? void 0 : _a.name) && !(symbol.getFlags() & ts.SymbolFlags.ValueModule)) {
                        this.parseTypeBase(type, 1048576 /* typeOf */, result);
                        result.member = this.getDocMember(symbol);
                        return;
                    }
                    const properties = this.checker.getPropertiesOfType(type);
                    const stringIndexInfo = this.checker.getIndexInfoOfType(type, ts.IndexKind.String);
                    const numberIndexInfo = this.checker.getIndexInfoOfType(type, ts.IndexKind.Number);
                    const callSignatures = this.checker.getSignaturesOfType(type, ts.SignatureKind.Call);
                    const constructSignatures = this.checker.getSignaturesOfType(type, ts.SignatureKind.Construct);
                    if (!properties.length && !stringIndexInfo && !numberIndexInfo) {
                        // 函数
                        if (callSignatures.length === 1 && !constructSignatures.length) {
                            this.parseTypeBase(type, 16384 /* function */, result);
                            const signature = result.signature = callSignatures[0];
                            result.typeParameters = (_b = signature.typeParameters) === null || _b === void 0 ? void 0 : _b.map(typeParameter => this.parseTypeParameter(typeParameter));
                            result.parameters = signature.parameters.map(parameter => this.parseParameter(parameter));
                            result.returnType = this.getDocType(this.checker.getReturnTypeOfSignature(signature));
                            return;
                        }
                        // 构造函数
                        if (constructSignatures.length === 1 && !callSignatures.length) {
                            this.parseTypeBase(type, 32768 /* constructor */, result);
                            const signature = result.signature = constructSignatures[0];
                            result.parameters = signature.parameters.map(parameter => this.parseParameter(parameter));
                            result.returnType = this.getDocType(this.checker.getReturnTypeOfSignature(signature));
                            return;
                        }
                    }
                    // 对象字面量
                    this.parseTypeBase(type, 65536 /* object */, result);
                    result.members = properties.map(property => this.getDocMember(property));
                    const index = (_c = symbol === null || symbol === void 0 ? void 0 : symbol.members) === null || _c === void 0 ? void 0 : _c.get(ts.InternalSymbolName.Index);
                    if (index) {
                        result.members.push(this.getDocMember(index));
                    }
                    const call = (_d = symbol === null || symbol === void 0 ? void 0 : symbol.members) === null || _d === void 0 ? void 0 : _d.get(ts.InternalSymbolName.Call);
                    if (call) {
                        result.members.unshift(this.getDocMember(call));
                    }
                    const constructor = (_e = symbol === null || symbol === void 0 ? void 0 : symbol.members) === null || _e === void 0 ? void 0 : _e.get(ts.InternalSymbolName.Constructor);
                    if (constructor) {
                        result.members.unshift(this.getDocMember(constructor));
                    }
                    return;
                }
            }
            // 并集/交集
            if (flags & ts.TypeFlags.UnionOrIntersection) {
                const nonOptional = this.checker.getNonOptionalType(type);
                if (nonOptional !== type) {
                    Object.assign(result, this.getDocType(nonOptional));
                    result.raw = type;
                    return;
                }
                this.parseTypeBase(type, flags & ts.TypeFlags.Union ? 4194304 /* union */ : 8388608 /* intersection */, result);
                result.operands = type.types.map(type => this.getDocType(type));
                return;
            }
            // 类型参数
            if (flags & ts.TypeFlags.TypeParameter) {
                this.parseTypeBase(type, type.thisType ? 4096 /* this */ : 2048 /* typeParameter */, result);
                result.member = this.getDocMember(type.getSymbol());
                return;
            }
            // 索引访问
            if (flags & ts.TypeFlags.IndexedAccess) {
                this.parseTypeBase(type, 2097152 /* indexedAccess */, result);
                result.target = this.getDocType(type.objectType);
                result.key = this.getDocType(type.indexType);
                return;
            }
            // 键查询
            if (flags & ts.TypeFlags.Index) {
                this.parseTypeBase(type, 524288 /* keyOf */, result);
                result.target = this.getDocType(type.type);
                return;
            }
            // 条件
            if (flags & ts.TypeFlags.Conditional) {
                this.parseTypeBase(type, 16777216 /* conditional */, result);
                result.checkType = this.getDocType(type.checkType);
                result.extendsType = this.getDocType(type.extendsType);
                // HACK: 因为 TS 没有暴露 getTrueTypeFromConditionalType，只能利用一次计算结果
                this.checker.typeToTypeNode(type, undefined, ts.NodeBuilderFlags.InTypeAlias);
                result.trueType = this.getDocType(type.resolvedTrueType);
                result.falseType = this.getDocType(type.resolvedFalseType);
                return;
            }
            // 唯一名称
            if (flags & ts.TypeFlags.UniqueESSymbol) {
                this.parseTypeBase(type, 2 /* native */, result);
                result.name = "unique symbol";
                return;
            }
            // 使用约束简化后的类型参数
            if (flags & ts.TypeFlags.Substitution) {
                Object.assign(result, this.getDocType(type.baseType));
                result.raw = type;
                return;
            }
            // 模板字面量(4.1 新增)
            if (flags & ts.TypeFlags.TemplateLiteral) {
                this.parseTypeBase(type, 32 /* templateLiteral */, result);
                result.spans = [];
                for (let i = 0; i < type.types.length; i++) {
                    result.spans.push(type.texts[i]);
                    result.spans.push(this.getDocType(type.types[i]));
                }
                result.spans.push(type.texts[type.texts.length - 1]);
                return;
            }
            // 不支持的类型
            this.parseTypeBase(type, 0 /* unknown */, result);
        });
    }
    /**
     * 解析类型基类
     * @param type 要解析的类型
     * @param typeType 类型类型
     * @param result 解析的结果
     */
    parseTypeBase(type, typeType, result) {
        result.typeType = typeType;
        result.raw = type;
    }
    /** 解析数据并缓存 */
    _parseCached(node, parser) {
        const cached = node[TypeScriptDocParser._docKey];
        if (cached) {
            return cached;
        }
        const result = node[TypeScriptDocParser._docKey] = {};
        parser(node, result);
        return result;
    }
    /**
     * 解析一个节点的源位置
     * @param node 要解析的节点
     * @param sourceFile 如果提供了节点所在的源文件，可以提升性能
     */
    getSourceLocation(node, sourceFile = node.getSourceFile()) {
        const start = node.getStart(sourceFile, true);
        const end = node.getEnd();
        const startLoc = sourceFile.getLineAndCharacterOfPosition(start);
        const endLoc = sourceFile.getLineAndCharacterOfPosition(end);
        return {
            sourcePath: resolve(sourceFile.fileName),
            start,
            end,
            line: startLoc.line,
            column: startLoc.character,
            endLine: endLoc.line,
            endColumn: endLoc.character
        };
    }
    /**
     * 获取类型的所有成员
     * @param type 要解析的类型
     */
    getPropertiesOfType(type) {
        return this.checker.getPropertiesOfType(type.raw).map(property => this.getDocMember(property));
    }
    /**
     * 获取类型等价的字符串
     * @param type 要解析的类型
     */
    typeToString(type) {
        return this.checker.typeToString(type.raw);
    }
}
/** 缓存键 */
TypeScriptDocParser._docKey = Symbol("doc");
/** 合并同名的多个标签 */
function concatComment(comment1, comment2) {
    return comment1 ? comment1 + "\n" + comment2 : comment2;
}
/** 表示成员类型的枚举 */
export var DocMemberType;
(function (DocMemberType) {
    /** 不支持的成员 */
    DocMemberType[DocMemberType["unknown"] = 0] = "unknown";
    /** 函数作用域变量 */
    DocMemberType[DocMemberType["var"] = 1] = "var";
    /** 块作用域变量 */
    DocMemberType[DocMemberType["let"] = 2] = "let";
    /** 常量 */
    DocMemberType[DocMemberType["const"] = 4] = "const";
    /** 函数 */
    DocMemberType[DocMemberType["function"] = 8] = "function";
    /** 类 */
    DocMemberType[DocMemberType["class"] = 16] = "class";
    /** 字段 */
    DocMemberType[DocMemberType["field"] = 32] = "field";
    /** 访问器 */
    DocMemberType[DocMemberType["accessor"] = 64] = "accessor";
    /** 构造函数 */
    DocMemberType[DocMemberType["constructor"] = 128] = "constructor";
    /** 方法 */
    DocMemberType[DocMemberType["method"] = 256] = "method";
    /** 事件 */
    DocMemberType[DocMemberType["event"] = 512] = "event";
    /** 索引器签名 */
    DocMemberType[DocMemberType["index"] = 1024] = "index";
    /** 函数调用签名 */
    DocMemberType[DocMemberType["call"] = 2048] = "call";
    /** 枚举 */
    DocMemberType[DocMemberType["enum"] = 4096] = "enum";
    /** 枚举成员 */
    DocMemberType[DocMemberType["enumMember"] = 8192] = "enumMember";
    /** 接口 */
    DocMemberType[DocMemberType["interface"] = 16384] = "interface";
    /** 类型别名 */
    DocMemberType[DocMemberType["typeAlias"] = 32768] = "typeAlias";
    /** 命名空间 */
    DocMemberType[DocMemberType["namespace"] = 65536] = "namespace";
    /** 模块 */
    DocMemberType[DocMemberType["module"] = 131072] = "module";
})(DocMemberType || (DocMemberType = {}));
/** 表示成员修饰符 */
export var DocMemberModifiers;
(function (DocMemberModifiers) {
    /** 是否导出 */
    DocMemberModifiers[DocMemberModifiers["export"] = 1] = "export";
    /** 是否默认导出 */
    DocMemberModifiers[DocMemberModifiers["exportDefault"] = 2] = "exportDefault";
    /** 是否公开 */
    DocMemberModifiers[DocMemberModifiers["public"] = 4] = "public";
    /** 是否私有 */
    DocMemberModifiers[DocMemberModifiers["private"] = 8] = "private";
    /** 是否保护 */
    DocMemberModifiers[DocMemberModifiers["protected"] = 16] = "protected";
    /** 是否内部 */
    DocMemberModifiers[DocMemberModifiers["internal"] = 32] = "internal";
    /** 可访问性修饰符 */
    DocMemberModifiers[DocMemberModifiers["accessiblity"] = 60] = "accessiblity";
    /** 是否静态 */
    DocMemberModifiers[DocMemberModifiers["static"] = 64] = "static";
    /** 是否可选 */
    DocMemberModifiers[DocMemberModifiers["optional"] = 128] = "optional";
    /** 是否只读 */
    DocMemberModifiers[DocMemberModifiers["readOnly"] = 256] = "readOnly";
    /** 是否虚拟 */
    DocMemberModifiers[DocMemberModifiers["virtual"] = 512] = "virtual";
    /** 是否抽象 */
    DocMemberModifiers[DocMemberModifiers["abstract"] = 1024] = "abstract";
    /** 是否密封 */
    DocMemberModifiers[DocMemberModifiers["final"] = 2048] = "final";
    /** 是否是生成器 */
    DocMemberModifiers[DocMemberModifiers["generator"] = 4096] = "generator";
    /** 是否异步 */
    DocMemberModifiers[DocMemberModifiers["async"] = 8192] = "async";
    /** 是否废弃 */
    DocMemberModifiers[DocMemberModifiers["deprecated"] = 16384] = "deprecated";
    /** 是否试验中 */
    DocMemberModifiers[DocMemberModifiers["experimental"] = 32768] = "experimental";
})(DocMemberModifiers || (DocMemberModifiers = {}));
/** 表示类型类型的枚举 */
export var DocTypeType;
(function (DocTypeType) {
    /** 不支持的类型 */
    DocTypeType[DocTypeType["unknown"] = 0] = "unknown";
    /** 错误类型 */
    DocTypeType[DocTypeType["error"] = 1] = "error";
    /** 内置基础类型 */
    DocTypeType[DocTypeType["native"] = 2] = "native";
    /** 数字字面量类型 */
    DocTypeType[DocTypeType["numberLiteral"] = 4] = "numberLiteral";
    /** 字符串字面量类型 */
    DocTypeType[DocTypeType["stringLiteral"] = 8] = "stringLiteral";
    /** 大整数字面量类型 */
    DocTypeType[DocTypeType["bigintLiteral"] = 16] = "bigintLiteral";
    /** 模板字面量类型 */
    DocTypeType[DocTypeType["templateLiteral"] = 32] = "templateLiteral";
    /** 类 */
    DocTypeType[DocTypeType["class"] = 64] = "class";
    /** 接口 */
    DocTypeType[DocTypeType["interface"] = 128] = "interface";
    /** 枚举 */
    DocTypeType[DocTypeType["enum"] = 256] = "enum";
    /** 枚举成员 */
    DocTypeType[DocTypeType["enumMember"] = 512] = "enumMember";
    /** 别名类型 */
    DocTypeType[DocTypeType["typeAlias"] = 1024] = "typeAlias";
    /** 类型参数 */
    DocTypeType[DocTypeType["typeParameter"] = 2048] = "typeParameter";
    /** 当前类型引用类型 */
    DocTypeType[DocTypeType["this"] = 4096] = "this";
    /** 泛型 */
    DocTypeType[DocTypeType["generic"] = 8192] = "generic";
    /** 函数类型 */
    DocTypeType[DocTypeType["function"] = 16384] = "function";
    /** 构造函数类型 */
    DocTypeType[DocTypeType["constructor"] = 32768] = "constructor";
    /** 匿名对象类型 */
    DocTypeType[DocTypeType["object"] = 65536] = "object";
    /** 数组类型 */
    DocTypeType[DocTypeType["array"] = 131072] = "array";
    /** 元组类型 */
    DocTypeType[DocTypeType["tuple"] = 262144] = "tuple";
    /** 键查询 */
    DocTypeType[DocTypeType["keyOf"] = 524288] = "keyOf";
    /** 类型查询 */
    DocTypeType[DocTypeType["typeOf"] = 1048576] = "typeOf";
    /** 属性访问 */
    DocTypeType[DocTypeType["indexedAccess"] = 2097152] = "indexedAccess";
    /** 并集类型 */
    DocTypeType[DocTypeType["union"] = 4194304] = "union";
    /** 交集类型 */
    DocTypeType[DocTypeType["intersection"] = 8388608] = "intersection";
    /** 条件类型 */
    DocTypeType[DocTypeType["conditional"] = 16777216] = "conditional";
})(DocTypeType || (DocTypeType = {}));
//# sourceMappingURL=typeScriptDocParser.js.map