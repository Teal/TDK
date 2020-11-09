define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.cb = exports.d2 = exports.long = exports.d = exports.t3 = exports.A = exports.t2 = exports.t1 = exports.NP = exports.ES = exports.E1 = exports.I1 = exports.C2 = exports.C1 = exports.func2 = exports.func1 = exports.var3 = exports.var2 = exports.var1 = void 0;
    /** var1 summary */
    exports.var1 = 1;
    /** @internal var2 summary */
    exports.var2 = 1;
    /**
     * var3 summary
     * @summary var3 summary.addon
     * @remarks var3 remarks
     * @see var1
     * @deprecated use var1 instead
     * @example code = 1
     * @example code = 2
     * @example 示例
     * code = 3
     * @example #### 示例
     * ```ts
     * code = 3
     * ```
     */
    exports.var3 = 1;
    /**
     * func1 summary
     * @param p1 p1 summary
     * @param p1.d d summary
     * @param p1.return p1 return
     * @param _.p2 p2 summary
     * @param _.p4 p4 summary
     * @param p6 p6 summary
     * @param p7 p7 summary
     * @param p8 p8 summary
     * @returns return summary
     */
    function func1(p1, [p2, p3, [p3_1]], { p4, p5 }, p6 = 1, p7, ...p8) { }
    exports.func1 = func1;
    /**
     * func2 summary 3
     */
    function func2() { }
    exports.func2 = func2;
    /**
     * C1 summary
     */
    class C1 {
        constructor() {
            this.field1 = 1;
            this._f = 1;
        }
        /** get prop1*/
        get prop1() { return 0; }
        /** get prop2 */
        set prop2(value) { }
        /** get prop3 */
        get prop3() { return 0; }
        /** set prop3 */
        set prop3(value) { }
        func1() { return this; }
        static get s_prop1() { return 0; }
    }
    exports.C1 = C1;
    class C2 extends C1 {
        constructor() {
            super(...arguments);
            this.c2Prop = 1;
        }
        static set s_prop2(value) { }
        static get s_prop3() { return 0; }
        static set s_prop3(value) { }
        static async s_func1() { }
        get prop1() { return 1; }
        func2(f) {
            return 2;
        }
    }
    exports.C2 = C2;
    C2.s_field1 = 1;
    var E1;
    (function (E1) {
        E1[E1["m1"] = 0] = "m1";
        E1[E1["m2"] = 8] = "m2";
        E1[E1["m3"] = 9] = "m3";
    })(E1 = exports.E1 || (exports.E1 = {}));
    var ES;
    (function (ES) {
        ES["m1"] = "d";
        ES["m2"] = "e";
        ES["m3"] = "ff";
    })(ES = exports.ES || (exports.ES = {}));
    var NP;
    (function (NP_1) {
        let NP;
        (function (NP_2) {
            function NP() {
                return 0;
            }
            NP_2.NP = NP;
            (function (NP) {
                NP.f = 2;
            })(NP = NP_2.NP || (NP_2.NP = {}));
        })(NP = NP_1.NP || (NP_1.NP = {}));
    })(NP = exports.NP || (exports.NP = {}));
    class A {
    }
    exports.A = A;
    var a;
    /**
     * aaa
     * @param cb callback
     * @param cb.t t
     * @param cb.return return
     */
    function cb(cb) {
    }
    exports.cb = cb;
});
//# sourceMappingURL=api.js.map