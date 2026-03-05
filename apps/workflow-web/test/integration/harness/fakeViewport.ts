/**
 * TWEB09: Deterministic viewport/resize controls for layout and graph
 * direction assertions.
 *
 * Provides imperative viewport size manipulation and observation for
 * integration tests that verify responsive layout breakpoints,
 * graph direction switches (LR ↔ TB), and panel visibility rules.
 *
 * @vitest-environment jsdom
 */

// ---------------------------------------------------------------------------
// Viewport presets
// ---------------------------------------------------------------------------

export type ViewportPreset = {
  name: string;
  width: number;
  height: number;
};

export const VIEWPORT_PRESETS = {
  mobile: { name: 'mobile', width: 375, height: 667 } satisfies ViewportPreset,
  tablet: { name: 'tablet', width: 768, height: 1024 } satisfies ViewportPreset,
  desktop: { name: 'desktop', width: 1440, height: 900 } satisfies ViewportPreset,
  wide: { name: 'wide', width: 1920, height: 1080 } satisfies ViewportPreset,
  ultraWide: { name: 'ultraWide', width: 2560, height: 1440 } satisfies ViewportPreset,
} as const;

export type ViewportPresetName = keyof typeof VIEWPORT_PRESETS;

// ---------------------------------------------------------------------------
// Resize observer mock
// ---------------------------------------------------------------------------

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

/**
 * Minimal mock of `ResizeObserver` that allows deterministic trigger of
 * resize callbacks with controlled dimensions.
 */
export class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];

  private readonly callback: ResizeCallback;
  private readonly observed = new Set<Element>();

  constructor(callback: ResizeCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.observed.clear();
  }

  /** Trigger the callback for all observed targets with the given dimensions. */
  triggerResize(width: number, height: number): void {
    const entries: ResizeObserverEntry[] = [...this.observed].map((target) =>
      createResizeEntry(target, width, height),
    );

    if (entries.length > 0) {
      this.callback(entries);
    }
  }

  /** Trigger the callback for a specific observed target. */
  triggerResizeFor(target: Element, width: number, height: number): void {
    if (!this.observed.has(target)) {
      return;
    }

    this.callback([createResizeEntry(target, width, height)]);
  }

  getObservedElements(): Element[] {
    return [...this.observed];
  }
}

function createResizeEntry(target: Element, width: number, height: number): ResizeObserverEntry {
  const contentRect = {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  };

  return {
    target,
    contentRect,
    borderBoxSize: [{ blockSize: height, inlineSize: width }],
    contentBoxSize: [{ blockSize: height, inlineSize: width }],
    devicePixelContentBoxSize: [{ blockSize: height, inlineSize: width }],
  };
}

// ---------------------------------------------------------------------------
// Viewport controller
// ---------------------------------------------------------------------------

export type FakeViewportController = {
  /** Set the viewport to a named preset. */
  setPreset: (preset: ViewportPresetName) => void;
  /** Set the viewport to arbitrary dimensions. */
  setSize: (width: number, height: number) => void;
  /** Get the current viewport dimensions. */
  getSize: () => { width: number; height: number };
  /** Trigger all registered matchMedia listeners for the current viewport. */
  triggerMatchMediaListeners: () => void;
  /** Trigger all FakeResizeObserver callbacks. */
  triggerResizeObservers: () => void;
  /** Install the fake viewport (replaces `window.innerWidth`, `window.innerHeight`, `ResizeObserver`, `matchMedia`). */
  install: () => void;
  /** Restore original window properties. */
  restore: () => void;
};

type MediaQueryListener = (event: MediaQueryListEvent) => void;

/**
 * Create a fake viewport controller that overrides `window.innerWidth`,
 * `window.innerHeight`, `ResizeObserver`, and `matchMedia` for
 * deterministic layout testing.
 */
export function createFakeViewport(
  initial: ViewportPresetName | { width: number; height: number } = 'desktop',
): FakeViewportController {
  const initialSize = typeof initial === 'string' ? VIEWPORT_PRESETS[initial] : initial;

  let currentWidth = initialSize.width;
  let currentHeight = initialSize.height;

  const mediaQueryListeners: Array<{ query: string; listener: MediaQueryListener }> = [];

  // Capture originals
  let origInnerWidth: PropertyDescriptor | undefined;
  let origInnerHeight: PropertyDescriptor | undefined;
  let origResizeObserver: typeof ResizeObserver | undefined;
  let origMatchMedia: typeof window.matchMedia | undefined;
  let installed = false;

  const fakeMatchMedia = (query: string): MediaQueryList => {
    const evaluate = (): boolean => {
      const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/);
      const maxWidthMatch = query.match(/\(max-width:\s*(\d+)px\)/);

      let result = true;

      if (minWidthMatch) {
        result = result && currentWidth >= parseInt(minWidthMatch[1]!, 10);
      }

      if (maxWidthMatch) {
        result = result && currentWidth <= parseInt(maxWidthMatch[1]!, 10);
      }

      return result;
    };

    const mql: MediaQueryList = {
      matches: evaluate(),
      media: query,
      onchange: null,
      addListener: (listener) => {
        mediaQueryListeners.push({
          query,
          listener: listener as MediaQueryListener,
        });
      },
      removeListener: (listener) => {
        const index = mediaQueryListeners.findIndex(
          (entry) => entry.listener === (listener as MediaQueryListener),
        );
        if (index >= 0) mediaQueryListeners.splice(index, 1);
      },
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        const fn =
          typeof listener === 'function'
            ? (listener as MediaQueryListener)
            : (listener.handleEvent as MediaQueryListener);
        mediaQueryListeners.push({ query, listener: fn });
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        const fn =
          typeof listener === 'function'
            ? (listener as MediaQueryListener)
            : (listener.handleEvent as MediaQueryListener);
        const index = mediaQueryListeners.findIndex((entry) => entry.listener === fn);
        if (index >= 0) mediaQueryListeners.splice(index, 1);
      },
      dispatchEvent: () => false,
    };

    return mql;
  };

  const controller: FakeViewportController = {
    setPreset: (preset) => {
      const size = VIEWPORT_PRESETS[preset];
      currentWidth = size.width;
      currentHeight = size.height;
    },

    setSize: (width, height) => {
      currentWidth = width;
      currentHeight = height;
    },

    getSize: () => ({ width: currentWidth, height: currentHeight }),

    triggerMatchMediaListeners: () => {
      for (const entry of mediaQueryListeners) {
        const minWidthMatch = entry.query.match(/\(min-width:\s*(\d+)px\)/);
        const maxWidthMatch = entry.query.match(/\(max-width:\s*(\d+)px\)/);

        let matches = true;
        if (minWidthMatch) {
          matches = matches && currentWidth >= parseInt(minWidthMatch[1]!, 10);
        }
        if (maxWidthMatch) {
          matches = matches && currentWidth <= parseInt(maxWidthMatch[1]!, 10);
        }

        entry.listener({ matches, media: entry.query } as MediaQueryListEvent);
      }
    },

    triggerResizeObservers: () => {
      for (const observer of FakeResizeObserver.instances) {
        observer.triggerResize(currentWidth, currentHeight);
      }
    },

    install: () => {
      if (installed) return;
      installed = true;
      FakeResizeObserver.instances = [];

      origInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
      origInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
      origResizeObserver = globalThis.ResizeObserver;
      origMatchMedia = window.matchMedia;

      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        get: () => currentWidth,
      });

      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        get: () => currentHeight,
      });

      globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
      window.matchMedia = fakeMatchMedia;
    },

    restore: () => {
      if (!installed) return;
      installed = false;

      if (origInnerWidth) {
        Object.defineProperty(window, 'innerWidth', origInnerWidth);
      }

      if (origInnerHeight) {
        Object.defineProperty(window, 'innerHeight', origInnerHeight);
      }

      if (origResizeObserver) {
        globalThis.ResizeObserver = origResizeObserver;
      }

      if (origMatchMedia) {
        window.matchMedia = origMatchMedia;
      }

      FakeResizeObserver.instances = [];
      mediaQueryListeners.length = 0;
    },
  };

  return controller;
}
