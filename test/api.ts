/** var1 summary */
export var var1 = 1
/** @internal var2 summary */
export let var2 = 1
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
export const var3 = 1

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
export function func1(p1: (d: number) => any, [p2, p3, [p3_1]]: [number, number, [number]], { p4, p5 }: { p4: number, p5: number }, p6 = 1, p7?: number, ...p8: number[]) { }

/**
 * func2 summary 1
 */
export function func2(): void

/**
 * func2 summary 2
 */
export function func2(_): number

/**
 * func2 summary 3
 */
export function func2(): any { }

/**
 * C1 summary
 */
export abstract class C1 {
	constructor() { }
	field1 = 1
	/** get prop1*/
	get prop1() { return 0 }
	/** get prop2 */
	set prop2(value: any) { }
	/** get prop3 */
	get prop3() { return 0 }
	/** set prop3 */
	set prop3(value) { }
	private _f = 1
	func1() { return this }
	protected static get s_prop1() { return 0 }
	/**
	 * func2 summary
	 * @param f f summary
	 * @returns should   return
	 */
	abstract func2(f: number): any
}

export class C2 extends C1 {
	private static readonly s_field1 = 1
	static set s_prop2(value: any) { }
	static get s_prop3() { return 0 }
	c2Prop = 1
	static set s_prop3(value) { }
	static async s_func1() { }
	get prop1() { return 1 }
	func2(f: number) {
		return 2
	}
}

export interface I1 {
	f1?: number
}
export interface I2 extends I1 { }

export var I1: {
	obj: number
}

export enum E1 {
	m1,
	m2 = 8,
	m3,
}

export const enum ES {
	m1 = "d",
	m2 = "e",
	m3 = "ff",
}

export namespace NP {
	export namespace NP {
		export function NP() {
			return 0
		}
		export namespace NP {
			export var f = 2
		}
	}
}

export var t1: {
	n1: number,
	n2: any,
	/** asdasd */
	n3: 1,
	n4: {}[],
	n5: [never, boolean, string],
	n6: "foo"
}

export var t2: {
	n1: String,
	n2: typeof globalThis,
	n3: E1,
	n4: E1.m1 | E1.m2
}

export class A<T extends string = "1"> {
	a: T
	b: this
	c: T extends { a: 1 } ? 1 : 2 | 3
	d: A<"2">
}

export var t3: () => number

export type N1 = { d(): N1 }

export type N2 = N1

export interface D<T> extends N2 {
	f: T
}

export interface E extends D<1> {

}

interface a {
	f: 2
}

var a: {
	d: 2
}

export var d: Pick<N1, keyof N1>


export var long:
	| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
	| 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19
	| 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29
	| 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39
	| 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49
	| "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
	| "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19"
	| "20" | "21" | "22" | "23" | "24" | "25" | "26" | "27" | "28" | "29"
	| "30" | "31" | "32" | "33" | "34" | "35" | "36" | "37" | "38" | "39"
	| "40" | "41" | "42" | "43" | "44" | "45" | "46" | "47" | "48" | "49"

export var d2: <T>(f: T, f2: E) => { [key: string]: T | number, rest: 3 }

/**
 * aaa
 * @param cb callback
 * @param cb.t t
 * @param cb.return return
 */
export function cb(cb: (t: string) => void) {

}