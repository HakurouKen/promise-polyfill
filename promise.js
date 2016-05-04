(function (root, factory) {
    'use strict';
    // UMD modules
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
        module.exports = factory();
    } else if (typeof define === 'function' && typeof define.amd === 'object') {
        define(factory);
    } else {
        root.Promise = factory();
    }
})(this, function(){

function toArray(arr) {
    return Array.prototype.slice.call(arr, 0);
}

function extend(deep, dest, src) {
    var key,
        copy;
    if (deep !== true && deep !== false) {
        src = dest;
        dest = deep;
        deep = false;
    }

    for (key in src) {
        if (src.hasOwnProperty(key)) {
            copy = src[key];
            if (deep) {
                // window.window === window
                if (dest === copy) {
                    continue;
                }
                if (type(copy) === 'object') {
                    dest[key] = arguments.callee(dest[key] || {}, copy);
                } else if (type(copy) === 'array') {
                    dest[key] = arguments.callee(dest[key] || [], copy);
                } else {
                    dest[key] = copy;
                }
            } else {
                dest[key] = copy;
            }
        }
    }
    return dest;
}

function type(o) {
    return Object.prototype.toString.call(o).slice(8, -1).toLowerCase();
}

function noop(){}

function Deferred() {
    this.status = Promise.STATUS.PENDING;
    this._resolves = [];
    this._rejects = [];
    this._value = null;
    this._reason = null;
}

extend(Deferred.prototype, {
    resolve: function(value) {
        var self = this;
        if (self.status !== Promise.STATUS.PENDING) {
            return self;
        }
        self.status = Promise.STATUS.FULFILLED;
        self._value = value;
        self._resolves.forEach(function(f) {
            Promise.asap(f(self._value));
        });
        self._resolves = [];
        self._rejects = [];
        return self;
    },
    reject: function(reason) {
        var self = this;
        if (self.status !== Promise.STATUS.PENDING) {
            return self;
        }
        self.status = Promise.STATUS.REJECTED;
        self._reason = reason;

        self._rejects.forEach(function(f) {
            Promise.asap(f(self._reason));
        });
        return self;
    },
    then: function(onFulfilled, onRejected) {
        var self = this;

        function fulfill(value) {
            var ret = onFulfilled ? onFulfilled(value) : value;
            if (Promise.isThenable(ret)) {
                ret.then(function(value) {
                    self.resolve(value);
                });
            } else {
                self.resolve(value);
            }
            return ret;
        }

        switch (self.status) {
            case Promise.STATUS.PENDING:
                self._resolves.push(fulfill);
                if (onRejected) {
                    self._rejects.push(onRejected);
                }
                break;
            case Promise.STATUS.FULFILLED:
                fulfill(self._value);
                break;
            case Promise.STATUS.REJECTED:
                onRejected(self._reason);
                break;
        }

        return self;
    }
});

function Promise(executor) {
    if (this.constructor !== Promise) {
        throw new TypeError('Promise must be constructed via "new"');
    }
    if (type(executor) !== 'function') {
        throw new TypeError('Executor must be a function');
    }

    var deferred = new Deferred;
    this.deferred = deferred;
    try {
        executor(function(value) {
            deferred.resolve(value);
        }, function(reason) {
            deferred.reject(reason);
        })
    } catch (e) {
        deferred.reject(e);
    }
}

Promise.STATUS = {
    PENDING: 0,
    FULFILLED: 1,
    REJECTED: 2
};

extend(Promise, {
    asap: typeof setImmediate !== "undefined" ? function(f) {
        return setImmediate(f);
    } : typeof process !== "undefined" && process.nextTick !== undefined ? function(f) {
        return process.nextTick(f);
    } : function(f) {
        return setTimeout(f, 0);
    },
    isThenable: function(o) {
        return o && type(o['then']) === 'function';
    }

});

extend(Promise, {
    all: function(iterable) {
        return new this(function (resolve, reject) {
            iterable = toArray(iterable);

            var l = iterable.length,
                resolved = 0,
                results = [];

            if( l ){
                iterable.forEach(function(p,index){
                    Promise.resolve(p).then(function(value){
                        results[index] = value;
                        if( ++resolved === l ){
                            resolve(results);
                        }
                    },reject);
                })
            } else {
                Promise.asap(resolve(results));
            }
        });
    },
    race: function(iterable) {
        return new this(function(resolve,reject){
            iterable = toArray(iterable);
            var l = iterable.length;

            if( l ){
                iterable.forEach(function(p,index){
                    Promise.resolve(iterable[index]).then(resolve,reject);
                })
            } else {
                Promise.resolve(null).then(resolve,reject);
            }
        });
    },
    reject: function(reason) {
        var promise = new this(noop);
        // solution from ypromise :
        // Do not go through resolver.reject() because an immediately rejected promise
        // always has no callbacks which would trigger an unnecessary warning
        // ** resolver is sth like deferred here. **
        promise.deferred._result = reason;
        promise.deferred._status = 'rejected';

        return promise;
    },
    resolve: function(value) {
        if (value && value.constructor === this) {
            return value;
        }
        return new this(function(resolve) {
            resolve(value);
        })
    }
});

extend(Promise.prototype, {
    then: function(onFulfilled, onRejected) {
        var _resolve, _reject;
        var promise = new this.constructor(function(resolve, reject) {
            _resolve = resolve;
            _reject = reject;
        });

        function wrapper(resolve, reject, f) {
            return function(data) {
                var result;
                try {
                    result = f(data);
                } catch (e) {
                    reject(e);
                    return;
                }
                resolve(result);
            }
        }

        this.deferred = this.deferred.then(
            type(onFulfilled) === 'function' ? wrapper(_resolve, _reject, onFulfilled) : _resolve,
            type(onRejected) === 'function' ? wrapper(_resolve, _reject, onRejected) : _reject
        );

        return promise;
    },
    catch: function(onRejected) {
        return this.then(null, onRejected);
    }
});

return Promise;

});
