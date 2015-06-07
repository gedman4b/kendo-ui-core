// -*- fill-column: 100 -*-

(function(f, define){
    define([ "./sheet.js", "./references.js" ], f);
})(function(){

    "use strict";

    // WARNING: removing the following jshint declaration and turning
    // == into === to make JSHint happy will break functionality.
    /* jshint eqnull:true, newcap:false, laxbreak:true, shadow:true, validthis:true */
    /* global console */

    var calc = {};
    var spreadsheet = kendo.spreadsheet;
    spreadsheet.calc = calc;
    var exports = calc.runtime = {};
    var Class = kendo.Class;

    var Ref = spreadsheet.Ref;
    var NameRef = spreadsheet.NameRef;
    var CellRef = spreadsheet.CellRef;
    var RangeRef = spreadsheet.RangeRef;
    var UnionRef = spreadsheet.UnionRef;
    var NULL = spreadsheet.NULLREF;

    /* -----[ Errors ]----- */

    var CalcError = Class.extend({
        init: function CalcError(code) {
            this.code = code;
        },
        toString: function() {
            return "#" + this.code + "!";
        }
    });

    /* -----[ Context ]----- */

    var Context = Class.extend({
        init: function Context(callback, formula, ss, sheet, row, col) {
            this.callback = callback;
            this.formula = formula;
            this.ss = ss;
            this.sheet = sheet;
            this.row = row;
            this.col = col;
        },

        resolve: function(val) {
            this.formula.value = val;
            this.ss.onFormula(this.sheet, this.row, this.col, val);
            if (this.callback) {
                this.callback(val);
            }
        },

        error: function(val) {
            this.ss.onFormula(this.sheet, this.row, this.col, val);
            if (this.callback) {
                this.callback(val);
            }
            return val;
        },

        resolveCells: function(a, f) {
            var context = this, formulas = [];

            for (var i = 0; i < a.length; ++i) {
                var x = a[i];
                if (x instanceof Ref) {
                    if (!add(context.ss.getRefCells(x))) {
                        context.error(new CalcError("CIRCULAR"));
                        return;
                    }
                }
            }

            if (!formulas.length) {
                return f.call(context);
            }

            for (var pending = formulas.length, i = 0; i < formulas.length; ++i) {
                fetch(formulas[i]);
            }
            function fetch(cell) {
                cell.formula.exec(context.ss, cell.sheet, cell.row, cell.col, function(val){
                    if (!--pending) {
                        f.call(context);
                    }
                });
            }
            function add(a) {
                for (var i = 0; i < a.length; ++i) {
                    var cell = a[i];
                    if (cell.formula) {
                        if (cell.formula === context.formula) {
                            return false;
                        }
                        formulas.push(cell);
                    }
                }
                return true;
            }
        },

        cellValues: function(a, f) {
            var ret = [];
            for (var i = 0; i < a.length; ++i) {
                var val = a[i];
                if (val instanceof Ref) {
                    val = this.ss.getData(val);
                    ret = ret.concat(val);
                } else {
                    ret.push(val);
                }
            }
            if (f) {
                return f.apply(this, ret);
            }
            return ret;
        },

        forNumbers: function(a, f) {
            if (a instanceof Ref) {
                a = this.cellValues([ a ]);
            }
            if (Array.isArray(a)) {
                for (var i = 0; i < a.length; ++i) {
                    this.forNumbers(a[i], f);
                }
            }
            if (typeof a == "number") {
                f(a);
            }
        },

        func: function(fname, callback, args) {
            fname = fname.toLowerCase();
            if (Object.prototype.hasOwnProperty.call(FUNCS, fname)) {
                return FUNCS[fname].call(this, callback, args);
            }
            this.error(new CalcError("NAME"));
        },

        bool: function(val) {
            if (val instanceof Ref) {
                val = this.ss.getData(val);
            }
            if (typeof val == "string") {
                return val.toLowerCase() == "true";
            }
            if (typeof val == "number") {
                return val !== 0;
            }
            if (typeof val == "boolean") {
                return val;
            }
            return val != null;
        },

        divide: function(callback, left, right) {
            if (right === 0) {
                this.error(new CalcError("DIV/0"));
            } else {
                callback(left / right);
            }
        },

        asMatrix: function(range) {
            var self = this, width = 0;
            if (range instanceof RangeRef) {
                var tl = range.topLeft;
                var cells = self.ss.getRefCells(range);
                var m = [];
                cells.forEach(function(cell){
                    var row = cell.row - tl.row;
                    row = m[row] || (m[row] = []);
                    row[cell.col - tl.col] = cell.value;
                });
                return new Matrix(self, range.height(), range.width(), m);
            }
            if (Array.isArray(range) && range.length > 0) {
                range = resolveRefs(range, 0);
                if (width > 0) {
                    return new Matrix(self, range.length, width, range);
                }
                else {
                    return new Matrix(self, 1, range.length, [ range ]);
                }
            }

            function resolveRefs(a, level) {
                if (level == 1) {
                    width = Math.max(width, a.length);
                }
                return a.map(function(x){
                    if (Array.isArray(x)) {
                        return resolveRefs(x, level + 1);
                    }
                    if (x instanceof RangeRef || x instanceof UnionRef) {
                        return resolveRefs(self.ss.getData(x), level + 1);
                    }
                    if (x instanceof Ref) {
                        return self.ss.getData(x);
                    }
                    return x;
                });
            }
        }
    });

    var Matrix = Class.extend({
        init: function Matrix(context, height, width, data) {
            this.context = context;
            this.height = height;
            this.width = width;
            this.data = data;
        },
        get: function(row, col) {
            var line = this.data[row];
            var val = line ? line[col] : null;
            return val instanceof Ref ? this.context.ss.getData(val) : val;
        }
    });

    /* -----[ Formula ]----- */

    var Formula = Class.extend({
        init: function Formula(refs, handler, printer){
            this.refs = refs;
            this.handler = handler;
            this.print = printer;
            this.absrefs = null;
        },
        clone: function() {
            return new Formula(this.refs, this.handler, this.print);
        },
        exec: function(ss, sheet, row, col, callback) {
            if ("value" in this) {
                if (callback) {
                    callback(this.value);
                }
            } else {
                if (!this.absrefs) {
                    this.absrefs = this.refs.map(function(ref){
                        return ref.absolute(row, col);
                    }, this);
                }
                var ctx = new Context(callback, this, ss, sheet, row, col);
                ctx.resolveCells(this.absrefs, this.handler);
            }
        },
        reset: function() {
            delete this.value;
        },
        adjust: function(operation, start, delta, formulaRow, formulaCol) {
            this.absrefs = null;
            this.refs = this.refs.map(function(ref){
                if (ref instanceof CellRef) {
                    return deletesCell(ref) ? NULL : fixCell(ref);
                }
                else if (ref instanceof RangeRef) {
                    var del_start = deletesCell(ref.topLeft);
                    var del_end = deletesCell(ref.bottomRight);
                    if (del_start && del_end) {
                        return NULL;
                    }
                    if (del_start) {
                        // this case is rather tricky to handle with relative references.  what we
                        // want here is that the range top-left stays in place, even if the cell
                        // itself is being deleted.  So, we (1) convert it to absolute cell based on
                        // formula position, then make it relative to the location where the formula
                        // will end up after the deletion.
                        return new RangeRef(
                            ref.topLeft
                                .absolute(formulaRow, formulaCol)
                                .relative(
                                    operation == "row" ? fixNumber(formulaRow) : formulaRow,
                                    operation == "col" ? fixNumber(formulaCol) : formulaCol,
                                    ref.topLeft.rel
                                ),
                            fixCell(ref.bottomRight)
                        ).setSheet(ref.sheet, ref.hasSheet());
                    }
                    return new RangeRef(
                        fixCell(ref.topLeft),
                        fixCell(ref.bottomRight)
                    ).setSheet(ref.sheet, ref.hasSheet());
                }
                else if (!(ref instanceof NameRef)) {
                    throw new Error("Unknown reference in adjust");
                }
            });
            function deletesCell(ref) {
                if (delta >= 0) {
                    return false;
                }
                ref = ref.absolute(formulaRow, formulaCol);
                if (operation == "row") {
                    return ref.row >= start && ref.row < start - delta;
                } else {
                    return ref.col >= start && ref.col < start - delta;
                }
            }
            function fixCell(ref) {
                return new CellRef(
                    operation == "row" ? fixNumber(ref.row, ref.rel & 2, formulaRow) : ref.row,
                    operation == "col" ? fixNumber(ref.col, ref.rel & 1, formulaCol) : ref.col,
                    ref.rel
                ).setSheet(ref.sheet, ref.hasSheet());
            }
            function fixNumber(num, relative, base) {
                if (relative) {
                    var abs = base + num;
                    if (abs < start && start <= base) {
                        return num - delta;
                    } else if (base < start && start <= abs) {
                        return num + delta;
                    } else {
                        return num;
                    }
                } else {
                    if (num >= start) {
                        return num + delta;
                    } else {
                        return num;
                    }
                }
            }
        }
    });

    // spreadsheet functions --------

    function arrayHandler1(func) {
        return function doit(val) {
            if (Array.isArray(val)) {
                return val.map(doit);
            }
            return func(val);
        };
    }

    function arrayHandler2(func) {
        return function doit(left, right) {
            if (Array.isArray(left) && Array.isArray(right)) {
                return left.map(function(el, i){
                    return doit(el, right[i]);
                });
            }
            else if (Array.isArray(left)) {
                return left.map(function(el){
                    return doit(el, right);
                });
            }
            else if (Array.isArray(right)) {
                return right.map(function(el){
                    return doit(left, el);
                });
            }
            else {
                return func(left, right);
            }
        };
    }

    function binaryNumeric(func) {
        var handler = arrayHandler2(function(left, right){
            left = +left;
            right = +right;
            if (isNaN(left) || isNaN(right)) {
                return new CalcError("VALUE");
            }
            else {
                return func(left, right);
            }
        });
        return function(callback, args) {
            callback(this.cellValues(args, handler));
        };
    }

    function binaryCompare(func) {
        var handler = arrayHandler2(function(left, right){
            if (typeof left == "string" && typeof right != "string") {
                right = right == null ? "" : right + "";
            }
            if (typeof left != "string" && typeof right == "string") {
                left = left == null ? "" : left + "";
            }
            if (typeof left == "number" && right == null) {
                right = 0;
            }
            if (typeof right == "number" && left == null) {
                left = 0;
            }
            if (typeof right == typeof left) {
                return func.call(this, left, right);
            } else {
                return new CalcError("VALUE");
            }
        });
        return function(callback, args) {
            callback(this.cellValues(args, handler));
        };
    }

    function unaryNumeric(func) {
        var handler = arrayHandler1(function(exp){
            exp = +exp;
            if (isNaN(exp)) {
                return new CalcError("VALUE");
            } else {
                return func.call(this, exp);
            }
        });
        return function(callback, args) {
            callback(this.cellValues(args, handler));
        };
    }

    var FUNCS = {

        /* -----[ binary ops ]----- */

        // arithmetic
        "binary+": binaryNumeric(function(left, right){
            return left + right;
        }),
        "binary-": binaryNumeric(function(left, right){
            return left - right;
        }),
        "binary*": binaryNumeric(function(left, right){
            return left * right;
        }),
        "binary/": binaryNumeric(function(left, right){
            if (right === 0) {
                return new CalcError("DIV/0");
            }
            return left / right;
        }),
        "binary^": binaryNumeric(function(left, right){
            return Math.pow(left, right);
        }),

        // text concat
        "binary&": (function(){
            var handler = arrayHandler2(function(left, right){
                if (left == null) { left = ""; }
                if (right == null) { right = ""; }
                return "" + left + right;
            });
            return function(callback, args) {
                callback(this.cellValues(args, handler));
            };
        })(),

        // boolean
        "binary=": (function(){
            var handler = arrayHandler2(function(left, right){
                return left === right;
            });
            return function(callback, args) {
                callback(this.cellValues(args, handler));
            };
        })(),
        "binary<>": (function(){
            var handler = arrayHandler2(function(left, right){
                return left !== right;
            });
            return function(callback, args) {
                callback(this.cellValues(args, handler));
            };
        })(),
        "binary<": binaryCompare(function(left, right){
            return left < right;
        }),
        "binary<=": binaryCompare(function(left, right){
            return left <= right;
        }),
        "binary>": binaryCompare(function(left, right){
            return left > right;
        }),
        "binary>=": binaryCompare(function(left, right){
            return left >= right;
        }),

        // range
        "binary:": function(callback, args) {
            var left = args[0], right = args[1];
            if (left instanceof CellRef && right instanceof CellRef) {
                callback(new RangeRef(left, right).setSheet(left.sheet || this.formula.sheet, left.hasSheet()));
            } else {
                this.error(new CalcError("REF"));
            }
        },
        // union
        "binary,": function(callback, args) {
            var left = args[0], right = args[1];
            if (left instanceof Ref && right instanceof Ref) {
                callback(new UnionRef([ left, right ]));
            } else {
                this.error(new CalcError("REF"));
            }
        },
        // intersect
        "binary ": function(callback, args) {
            var left = args[0], right = args[1];
            if (left instanceof Ref && right instanceof Ref) {
                var x = left.intersect(right);
                if (x === NULL) {
                    this.error(new CalcError("NULL"));
                } else {
                    callback(x);
                }
            } else {
                this.error(new CalcError("REF"));
            }
        },

        /* -----[ unary ops ]----- */

        "unary+": unaryNumeric(function(exp) {
            return exp;
        }),
        "unary-": unaryNumeric(function(exp) {
            return -exp;
        }),
        "unary%": unaryNumeric(function(exp) {
            return exp/100;
        })

    };

    /* -----[ exports ]----- */

    exports.CalcError = CalcError;
    exports.Formula = Formula;

    exports.defineFunction = function(name, func) {
        FUNCS[name.toLowerCase()] = func;
    };

}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });
