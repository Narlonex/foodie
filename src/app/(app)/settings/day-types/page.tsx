import Link from "next/link";
import {
  setDefaultDayTypeAction,
} from "@/actions/dayTypes";
import { Icon } from "@/components/icons";
import { SettingsDetail } from "@/components/settings-detail";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { formatGrams, formatKcal } from "@/lib/format";
import {
  listAssignmentsForDayType,
  listDayTypes,
} from "@/lib/repositories/dayTypes";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("settings.dayTypes");
}

const SAVED_MESSAGES: Record<string, string> = {
  created: "dayTypes.created",
  updated: "dayTypes.updated",
  deleted: "dayTypes.deleted",
  default: "dayTypes.defaultSuccess",
};

export default async function DayTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  const params = await searchParams;
  const types = await listDayTypes(viewer.user.id);
  const assignments = await Promise.all(
    types.map((type) => listAssignmentsForDayType(viewer.user.id, type.id)),
  );
  const savedKey = params.saved ? SAVED_MESSAGES[params.saved] : undefined;

  return (
    <SettingsDetail
      title={t("dayTypes.title")}
      intro={t("dayTypes.intro")}
      t={t}
      actions={
        <Link href="/settings/day-types/new" className="button">
          <Icon name="plus" size={17} />
          {t("dayTypes.new")}
        </Link>
      }
    >
      {savedKey ? (
        <p className="notice success" role="status">
          <Icon name="check" size={17} />
          {t(savedKey as Parameters<typeof t>[0])}
        </p>
      ) : null}

      {types.length === 0 ? (
        <div className="card card-pad">
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="calendar" size={22} />
            </span>
            <h3>{t("dayTypes.empty")}</h3>
            <p>{t("dayTypes.emptyHelp")}</p>
            <Link href="/settings/day-types/new" className="button small">
              <Icon name="plus" size={16} />
              {t("dayTypes.new")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="stack-sm">
          {types.map((type, index) => {
            const assigned = assignments[index] ?? [];
            const isDefault = viewer.profile.defaultDayTypeId === type.id;
            return (
              <article className="saved-meal-card" key={type.id}>
                <div className="row-between">
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{type.name}</strong>
                      {isDefault ? (
                        <span className="badge accent">
                          {t("dayTypes.default")}
                        </span>
                      ) : null}
                    </div>
                    <p className="field-hint">
                      {assigned.length > 0
                        ? t("dayTypes.assignedTo", { count: assigned.length })
                        : t("dayTypes.notAssigned")}
                    </p>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <Link
                      href={`/settings/day-types/${type.id}`}
                      className="button secondary small"
                    >
                      <Icon name="pencil" size={15} />
                      {t("common.edit")}
                    </Link>
                  </div>
                </div>
                <div className="food-macros">
                  <span>{formatKcal(type.kcal, viewer.profile.language)} kcal</span>
                  <span>
                    {t("dayTypes.proteinShort")}{" "}
                    {formatGrams(type.protein, viewer.profile.language)} g
                  </span>
                  <span>
                    {t("dayTypes.carbsShort")}{" "}
                    {formatGrams(type.carbs, viewer.profile.language)} g
                  </span>
                  <span>
                    {t("dayTypes.fatShort")}{" "}
                    {formatGrams(type.fat, viewer.profile.language)} g
                  </span>
                </div>
                {!isDefault ? (
                  <form action={setDefaultDayTypeAction}>
                    <input type="hidden" name="dayTypeId" value={type.id} />
                    <button type="submit" className="button-link">
                      {t("dayTypes.setDefault")}
                    </button>
                  </form>
                ) : (
                  <p className="source-note">{t("dayTypes.defaultDescription")}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </SettingsDetail>
  );
}
