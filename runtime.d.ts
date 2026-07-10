export interface InstallOptions {
  /**
   * Event called exactly once when ServiceWorker or AppCache is installed.
   * Can be useful to display "App is ready for offline usage" message.
   *
   * @memberOf InstallOptions
   */
  onInstalled?: () => void;

  /**
   * Not supported for AppCache.
   * Event called when update is found and browsers started updating process.
   * At this moment, some assets are downloading.
   *
   * @memberOf InstallOptions
   */
  onUpdating?: () => void;

  /**
   * Event called when onUpdating phase finished.
   * All required assets are downloaded at this moment and are ready to be updated.
   * Call runtime.applyUpdate() to apply update.
   *
   * @memberOf InstallOptions
   */
  onUpdateReady?: () => void;

  /**
   * Event called when upUpdating phase failed by some reason.
   * Nothing is downloaded at this moment and current update process
   * in your code should be canceled or ignored.
   *
   * @memberOf InstallOptions
   */
  onUpdateFailed?: () => void;

  /**
   * Event called when update is applied,
   * either by calling runtime.applyUpdate() or
   * some other way by a browser itself.
   *
   * @memberOf InstallOptions
   */
  onUpdated?: () => void;

  /**
   * Event called when the ServiceWorker could not be registered or refreshed:
   * `navigator.serviceWorker.register()` or `registration.update()` rejected
   * (network failure, non-2xx response for the SW script, redirect on the
   * script source, ...).
   *
   * The runtime forwards those rejections here and otherwise swallows them,
   * so declaring this callback is the only way to observe such a failure.
   *
   * Not supported for AppCache.
   *
   * @memberOf InstallOptions
   */
  onError?: (payload: { source: string; error?: unknown }) => void;
}

/**
 * Starts installation flow for ServiceWorker/AppCache
 * it's safe and must be called each time your page loads
 * (i.e. do not wrap it into any conditions).
 *
 * @param {InstallOptions} [options] The install options.
 *
 * @memberOf RuntimeStatic
 */
export function install(options?: InstallOptions): void;

/**
 * Used to apply update for existing installation.
 * See InstallOptions.
 *
 * @memberOf RuntimeStatic
 */
export function applyUpdate(): void;

/**
 * Performs check for updates of new ServiceWorker/AppCache.
 *
 * @memberOf RuntimeStatic
 */
export function update(): void;