import { describe, expect, it } from "vitest";
import {
  type ResultsPayload,
  decodeResultsParam,
  encodeResultsParam,
} from "./resultsUrl";

const samplePayload: ResultsPayload = {
  cityId: "canterbury",
  analysisId: "remove-route-135",
  origin: { address: "123 Riccarton Road", lat: -43.53, lng: 172.62 },
  destinations: [
    { label: "Work", address: "15 Cashel Street", lat: -43.53, lng: 172.64 },
    { label: "School", address: "1 School Road", lat: -43.5, lng: 172.6 },
  ],
  scenario: { calendarType: "weekday", timeWindow: "am_peak" },
};

describe("resultsUrl", () => {
  it("round-trips a full payload", () => {
    const encoded = encodeResultsParam(samplePayload);
    expect(decodeResultsParam(encoded)).toEqual(samplePayload);
  });

  it("produces a URL-component-safe string", () => {
    const encoded = encodeResultsParam(samplePayload);
    expect(encoded).toBe(encodeURIComponent(encoded));
  });

  it("returns null for garbage input rather than throwing", () => {
    expect(decodeResultsParam("not-valid-base64-json!!!")).toBeNull();
  });

  it("returns null for valid base64 that isn't the expected shape", () => {
    const notAPayload = btoa(JSON.stringify({ foo: "bar" }));
    expect(decodeResultsParam(notAPayload)).toBeNull();
  });
});
