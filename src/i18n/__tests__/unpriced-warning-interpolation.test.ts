import { afterEach, describe, expect, it } from "vitest";
import i18n, { SUPPORTED_LOCALES } from "../i18n";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("unpriced pricing warning", () => {
  it.each(SUPPORTED_LOCALES)("shows the missing model ID in %s", async (locale) => {
    await i18n.changeLanguage(locale);

    const message = i18n.t("settings.pricing.unpricedWarning", {
      models: "claude-fable-5",
    });

    expect(message).toContain("claude-fable-5");
    expect(message).not.toContain("{models}");
  });
});
