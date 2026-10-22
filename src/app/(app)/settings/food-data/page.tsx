import { SettingsDetail } from "@/components/settings-detail";
import { Icon } from "@/components/icons";
import { UsdaToggle } from "@/components/usda-toggle";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { isUsdaConfigured, isUsdaUsingDemoKey } from "@/lib/env";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("settings.foodData");
}

export default async function FoodDataSettingsPage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  const usda = isUsdaConfigured();
  const usdaDemo = isUsdaUsingDemoKey();

  return (
    <SettingsDetail
      title={t("foodData.title")}
      intro={t("foodData.intro")}
      t={t}
    >
      <div className="stack">
        <section className="card card-pad stack">
          <h2 className="card-title">{t("foodData.offTitle")}</h2>
          <p className="card-hint">{t("foodData.offText")}</p>
          <p className="source-note">{t("foodData.offAttribution")}</p>
          <div className="row">
            <a
              href="https://world.openfoodfacts.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="button-link"
            >
              Open Food Facts
            </a>
            <a
              href="https://openfoodfacts.github.io/openfoodfacts-server/api/"
              target="_blank"
              rel="noopener noreferrer"
              className="button-link"
            >
              {t("foodData.docs")}
            </a>
            <a
              href="https://opendatacommons.org/licenses/odbl/1-0/"
              target="_blank"
              rel="noopener noreferrer"
              className="button-link"
            >
              {t("foodData.offLicense")}
            </a>
          </div>
        </section>

        <section className="card card-pad stack">
          <h2 className="card-title">{t("foodData.usdaTitle")}</h2>
          <p className="card-hint">{t("foodData.usdaText")}</p>
          <UsdaToggle
            enabled={viewer.profile.usdaEnabled}
            language={viewer.profile.language}
            available={usda}
          />
          <p className={`notice ${usda && viewer.profile.usdaEnabled ? "success" : "warning"}`}>
            <Icon
              name={usda && viewer.profile.usdaEnabled ? "check" : "info"}
              size={17}
            />
            <span>
              {!usda
                ? t("foodData.usdaMissing")
                : !viewer.profile.usdaEnabled
                  ? t("foodData.usdaDisabled")
                  : usdaDemo
                    ? t("foodData.usdaDemo")
                    : t("foodData.usdaConfigured")}
            </span>
          </p>
          <p className="source-note">{t("foodData.usdaToggleNote")}</p>
          <a
            href="https://fdc.nal.usda.gov/api-guide"
            target="_blank"
            rel="noopener noreferrer"
            className="button-link"
          >
            {t("foodData.usdaDocs")}
          </a>
        </section>

        <section className="card card-pad stack">
          <h2 className="card-title">{t("foodData.customTitle")}</h2>
          <p className="card-hint">{t("foodData.customText")}</p>
        </section>

        <section className="card card-pad stack">
          <h2 className="card-title">{t("foodData.trustTitle")}</h2>
          <p className="card-hint">{t("foodData.trustText")}</p>
          <ul className="stack-sm">
            <li className="notice">
              <Icon name="info" size={17} />
              <span>{t("foodData.energyProvided")}</span>
            </li>
            <li className="notice">
              <Icon name="info" size={17} />
              <span>{t("foodData.energyCalculated")}</span>
            </li>
            <li className="notice">
              <Icon name="info" size={17} />
              <span>{t("foodData.energyUnknown")}</span>
            </li>
          </ul>
          <p className="source-note">{t("foodData.noScore")}</p>
        </section>

        <section className="card card-pad stack">
          <h2 className="card-title">{t("foodData.apiTitle")}</h2>
          <p className="card-hint">{t("foodData.offUserAgent")}</p>
          <p className="card-hint">{t("foodData.rateLimits")}</p>
          <p className="source-note">{t("foodData.cameraNote")}</p>
        </section>
      </div>
    </SettingsDetail>
  );
}
