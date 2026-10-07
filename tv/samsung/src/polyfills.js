(() => {
  if (!window.queueMicrotask) window.queueMicrotask = (callback) => Promise.resolve().then(callback);

  if (!Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function replaceChildren(...nodes) {
      while (this.firstChild) this.removeChild(this.firstChild);
      this.append(...nodes);
    };
  }

  if (!DocumentFragment.prototype.replaceChildren) {
    DocumentFragment.prototype.replaceChildren = Element.prototype.replaceChildren;
  }

  if (window.AbortSignal && window.AbortController && !AbortSignal.timeout) {
    AbortSignal.timeout = (milliseconds) => {
      const controller = new AbortController();
      window.setTimeout(() => controller.abort(), milliseconds);
      return controller.signal;
    };
  }

  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function replaceAll(search, replacement) {
      return this.split(search).join(replacement);
    };
  }

  if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, 'at', {
      configurable: true,
      writable: true,
      value(index) {
        const position = Math.trunc(Number(index) || 0);
        return this[position < 0 ? this.length + position : position];
      },
    });
  }
})();
