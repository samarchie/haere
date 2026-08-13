import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AnalysisSummary,
  cityOptions,
  fetchAnalyses,
  filterByCity,
} from "./analysisCatalogue";

const rawFixture = [
  {
    city_id: "canterbury",
    city_name: "Canterbury",
    analysis_id: "remove-route-135",
    title: "Remove Route 135",
    description: "Models the proposed removal of Route 135.",
    consultation_url: "https://example.org/consultation",
    consultation_status: "open",
  },
  {
    city_id: "second-city",
    city_name: "Second City",
    analysis_id: "example-analysis",
    title: "Example analysis",
    description: "Placeholder second analysis.",
    consultation_url: null,
    consultation_status: null,
  },
];

describe("fetchAnalyses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches analyses.json and converts to camelCase", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawFixture),
      }),
    );

    const analyses = await fetchAnalyses();

    expect(fetch).toHaveBeenCalledWith(
      "/data/analyses.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(analyses).toHaveLength(2);
    expect(analyses[0]).toEqual<AnalysisSummary>({
      cityId: "canterbury",
      cityName: "Canterbury",
      analysisId: "remove-route-135",
    });
  });
});

describe("filterByCity", () => {
  const analyses: AnalysisSummary[] = [
    {
      cityId: "canterbury",
      cityName: "Canterbury",
      analysisId: "a",
    },
    {
      cityId: "second-city",
      cityName: "Second City",
      analysisId: "b",
    },
  ];

  it('returns everything when cityId is null ("All cities")', () => {
    expect(filterByCity(analyses, null)).toEqual(analyses);
  });

  it("filters to the matching city", () => {
    expect(filterByCity(analyses, "canterbury")).toEqual([analyses[0]]);
  });
});

describe("cityOptions", () => {
  it("returns one deduplicated option per city", () => {
    const analyses: AnalysisSummary[] = [
      {
        cityId: "canterbury",
        cityName: "Canterbury",
        analysisId: "a",
      },
      {
        cityId: "canterbury",
        cityName: "Canterbury",
        analysisId: "b",
      },
    ];

    expect(cityOptions(analyses)).toEqual([
      { id: "canterbury", name: "Canterbury" },
    ]);
  });
});
