import { describe, expect, it } from "vitest";
import {
  decodeResultsParam,
  encodeResultsParam,
  type ResultsPayload,
  toWizardState,
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
  it("toWizardState maps a payload to a matching WizardState", () => {
    expect(toWizardState(samplePayload)).toEqual({
      cityId: samplePayload.cityId,
      analysisId: samplePayload.analysisId,
      origin: samplePayload.origin,
      destinations: samplePayload.destinations,
      scenario: samplePayload.scenario,
    });
  });

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

  it("round-trips a payload containing macronised te reo Māori place names (raw btoa would throw InvalidCharacterError on these non-Latin-1 characters)", () => {
    const payloadWithMacrons: ResultsPayload = {
      ...samplePayload,
      destinations: [
        {
          label: "Home",
          address: "1 Manchester Street, Ōtautahi",
          lat: -43.53,
          lng: 172.63,
        },
      ],
    };

    const encoded = encodeResultsParam(payloadWithMacrons);

    expect(decodeResultsParam(encoded)).toEqual(payloadWithMacrons);
  });

  it("returns null when origin is missing lat/lng", () => {
    const malformed = {
      ...samplePayload,
      origin: { address: "no coordinates here" },
    };
    const encoded = encodeURIComponent(btoa(JSON.stringify(malformed)));

    expect(decodeResultsParam(encoded)).toBeNull();
  });

  it("returns null when a destination is missing fields", () => {
    const malformed = {
      ...samplePayload,
      destinations: [{ label: "Work" }],
    };
    const encoded = encodeURIComponent(btoa(JSON.stringify(malformed)));

    expect(decodeResultsParam(encoded)).toBeNull();
  });

  it("returns null when origin lat/lng are non-finite (e.g. NaN after a bad parse)", () => {
    const malformed = {
      ...samplePayload,
      origin: { address: "bad coords", lat: Number.NaN, lng: 172.62 },
    };
    const encoded = encodeURIComponent(btoa(JSON.stringify(malformed)));

    expect(decodeResultsParam(encoded)).toBeNull();
  });
});
