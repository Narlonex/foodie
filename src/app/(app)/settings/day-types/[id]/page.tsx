import Link from "next/link";
import { notFound } from "next/navigation";
import { setDefaultDayTypeAction } from "@/actions/dayTypes";
import { DayTypeForm } from "@/components/day-type-form";
import { DeleteDayType } from "@/components/delete-day-type";
import { Icon } from "@/components/icons";
import { SettingsDetail } from "@/components/settings-detail";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { formatShortDate } from "@/lib/dates";
import {
  getDayType,
  listAssignmentsForDayType,
} from "@/lib/repositories/dayTypes";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("dayTypes.edit");
}

export default async function EditDayTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  const { id } = await params;
  const dayType = await getDayType(viewer.user.id, id);
  if (!dayType) notFound();
  const assignments = await listAssignmentsForDayType(viewer.user.id, dayType.id);
  const isDefault = viewer.profile.defaultDayTypeId === dayType.id;

  return (
    <SettingsDetail
      title={dayType.name}
      intro={t("dayTypes.targetsNote")}
      t={t}
      actions={
        isDefault ? (
          <span className="badge accent">{t("dayTypes.defaultBadge")}</span>
        ) : null
      }
    >
      <div className="stack">
        <DayTypeForm language={viewer.profile.language} dayType={dayType} />

        <section className="card card-pad stack">
          <h2 className="card-title">{t("dayTypes.assignTitle")}</h2>
          <p className="card-hint">{t("dayTypes.assignHelp")}</p>
          {assignments.length === 0 ? (
            <p className="source-note">{t("dayTypes.notAssigned")}</p>
          ) : (
            <>
              <p className="field-hint">
                {t("dayTypes.assignedTo", { count: assignments.length })}
              </p>
              <div className="saved-meal-items">
                {assignments.slice(0, 8).map((date) => (
                  <Link
                    key={date}
                    href={`/?date=${date}`}
                    className="meal-chip"
                  >
                    <Icon name="calendar" size={12} />{" "}
                    {formatShortDate(date, viewer.profile.language)}
                  </Link>
                ))}
                {assignments.length > 8 ? (
                  <span className="meal-chip">+{assignments.length - 8}</span>
                ) : null}
              </div>
            </>
          )}
        </section>

        <section className="card card-pad stack">
          <h2 className="card-title">{t("dayTypes.defaultBadge")}</h2>
          <p className="card-hint">{t("dayTypes.defaultHelp")}</p>
          {isDefault ? (
            <p className="badge accent">{t("dayTypes.default")}</p>
          ) : (
            <form action={setDefaultDayTypeAction}>
              <input type="hidden" name="dayTypeId" value={dayType.id} />
              <button type="submit" className="button secondary">
                {t("dayTypes.setDefault")}
              </button>
            </form>
          )}
        </section>

        <DeleteDayType
          dayTypeId={dayType.id}
          dayTypeName={dayType.name}
          assignedDates={assignments.length}
          isDefault={isDefault}
          language={viewer.profile.language}
        />
      </div>
    </SettingsDetail>
  );
}
