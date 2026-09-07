/**
 * The ONLY module in the codebase that names `navigator.hid`.
 *
 * Everything else (including the WebHID adapter's tests) depends on these narrow
 * structural interfaces, so unit tests never need a real `navigator.hid`.
 */

export interface HidReportItemLike {
  readonly reportCount?: number | undefined;
  readonly reportSize?: number | undefined;
  readonly usages?: readonly number[] | undefined;
}

export interface HidReportInfoLike {
  readonly reportId?: number | undefined;
  readonly items?: readonly HidReportItemLike[] | undefined;
}

export interface HidCollectionInfoLike {
  readonly usagePage?: number | undefined;
  readonly usage?: number | undefined;
  readonly inputReports?: readonly HidReportInfoLike[] | undefined;
  readonly outputReports?: readonly HidReportInfoLike[] | undefined;
  readonly featureReports?: readonly HidReportInfoLike[] | undefined;
}

export interface HidInputReportEventLike {
  readonly device: HidDeviceLike;
  readonly reportId: number;
  readonly data: DataView;
}

export interface HidDeviceLike {
  readonly productName: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly opened: boolean;
  readonly collections: readonly HidCollectionInfoLike[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(
    type: "inputreport",
    listener: (event: HidInputReportEventLike) => void,
  ): void;
  removeEventListener(
    type: "inputreport",
    listener: (event: HidInputReportEventLike) => void,
  ): void;
}

export interface HidConnectionEventLike {
  readonly device: HidDeviceLike;
}

export interface HidDeviceFilterLike {
  readonly vendorId?: number;
  readonly productId?: number;
}

export interface HidLike {
  getDevices(): Promise<HidDeviceLike[]>;
  requestDevice(options: {
    filters: readonly HidDeviceFilterLike[];
  }): Promise<HidDeviceLike[]>;
  addEventListener(
    type: "connect" | "disconnect",
    listener: (event: HidConnectionEventLike) => void,
  ): void;
  removeEventListener(
    type: "connect" | "disconnect",
    listener: (event: HidConnectionEventLike) => void,
  ): void;
}

/**
 * Returns the platform WebHID entry point, or null when the API is absent
 * (Firefox, Safari, an insecure context, or disabled by policy — the caller
 * must distinguish those downstream).
 */
export function getHid(nav: Navigator = navigator): HidLike | null {
  const candidate = (nav as unknown as { hid?: unknown }).hid;
  return candidate ? (candidate as HidLike) : null;
}
