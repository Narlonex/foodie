"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addExternalFoodAction,
  addSavedFoodAction,
  saveFavoriteFoodAction,
  toggleFavoriteAction,
} from "@/actions/foods";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { formatKcal, formatNumber, unitTranslationKey } from "@/lib/format";
import { scaleNutrients, toBaseAmount } from "@/lib/nutrition";
import {
  MEALS,
  NUTRIENT_KEYS,
  basisLabel,
  type Food,
  type FoodCandidate,
  type Language,
  type Meal,
  type NutrientKey,
  type Nutrients,
  type UnitSystem,
} from "@/lib/types";
import { Dialog } from "./dialog";
import { Icon } from "./icons";
import { ProgressBar, SourceBadge } from "./ui";

type SearchTab = "search" | "favorites" | "recent" | "custom";
type SearchStatus = "idle" | "loading" | "done" | "error";
type Source = "off" | "usda";

interface Selection {
  food: FoodCandidate | Food;
  libraryId: string | null;
  favorite: boolean;
}

function externalKey(food: Food | FoodCandidate): string {
  return `${food.source}:${food.externalId ?? food.barcode ?? food.name}`;
}

function selectionKey(food: Food | FoodCandidate): string {
  return "id" in food && food.id ? `id:${food.id}` : externalKey(food);
}

function defaultAmount(food: Food | FoodCandidate, unitSystem: UnitSystem): string {
  if (food.basisType === "serving") return "1";
  if (unitSystem === "imperial") {
    return food.basisType === "100ml" ? "3.4" : "3.5";
  }
  return "100";
}

function inputUnitFor(
  food: Food | FoodCandidate,
  unitSystem: UnitSystem,
): "g" | "ml" | "oz" | "floz" | "serving" {
  if (food.basisType === "serving") return "serving";
  if (food.basisType === "100ml") return unitSystem === "imperial" ? "floz" : "ml";
  return unitSystem === "imperial" ? "oz" : "g";
}

export function AddFoodDialog({
  open,
  onClose,
  initialMeal,
  date,
  language,
  unitSystem,
  favorites,
  recent,
  customFoods,
  usdaEnabled,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  initialMeal: Meal;
  date: string;
  language: Language;
  unitSystem: UnitSystem;
  favorites: Food[];
  recent: Food[];
  customFoods: Food[];
  usdaEnabled: boolean;
  onAdded: (message: string) => void;
}) {
  const t = getTranslator(language);
  const [tab, setTab] = useState<SearchTab>("search");
  const [source, setSource] = useState<Source>("off");
  const [query, setQuery] = useState("");
  const [searchTick, setSearchTick] = useState(0);
  const [results, setResults] = useState<FoodCandidate[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [amount, setAmount] = useState("100");
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(() => {
    const keys = new Set<string>();
    for (const food of [...favorites, ...recent, ...customFoods]) {
      if (food.id) keys.add(`id:${food.id}`);
      if (food.source !== "custom") keys.add(externalKey(food));
    }
    return keys;
  });
  const [favoritePending, setFavoritePending] = useState<string | null>(null);
  const [favoriteMessage, setFavoriteMessage] = useState<string | null>(null);

  const searchAbort = useRef<AbortController | null>(null);
  const detailAbort = useRef<AbortController | null>(null);
  const detailRequestKey = useRef<string | null>(null);

  const tr = useCallback(
    (key: string | null | undefined) =>
      key ? translate(language, key as TranslationKey) : null,
    [language],
  );

  useEffect(() => {
    if (!open) return;
    return () => {
      searchAbort.current?.abort();
      detailAbort.current?.abort();
    };
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "search") return;
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const timer = window.setTimeout(async () => {
      const controller = new AbortController();
      searchAbort.current?.abort();
      searchAbort.current = controller;
      setSearchStatus("loading");
      setSearchError(null);
      try {
        const response = await fetch(
          `/api/foods/search?q=${encodeURIComponent(trimmed)}&source=${source}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          results?: FoodCandidate[];
          error?: string;
        };
        if (!response.ok) {
          setResults([]);
          setSearchError(payload.error ?? "search.error");
          setSearchStatus("error");
          return;
        }
        setResults(Array.isArray(payload.results) ? payload.results : []);
        setSearchStatus("done");
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
        setSearchError("search.networkError");
        setSearchStatus("error");
      }
    }, 650);
    return () => {
      window.clearTimeout(timer);
      searchAbort.current?.abort();
    };
  }, [query, source, tab, open, searchTick]);

  const preview = useMemo(() => {
    if (!selection) return null;
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    try {
      const unit = inputUnitFor(selection.food, unitSystem);
      const base = toBaseAmount(parsed, unit);
      return scaleNutrients(selection.food, base.amount, base.amountUnit);
    } catch {
      return null;
    }
  }, [amount, selection, unitSystem]);

  const selectedUnit = selection
    ? inputUnitFor(selection.food, unitSystem)
    : "g";

  function chooseFood(
    food: Food | FoodCandidate,
    libraryId: string | null,
    needsDetail: boolean,
  ) {
    const key = libraryId ? `id:${libraryId}` : externalKey(food);
    const favorite = libraryId
      ? favoriteKeys.has(`id:${libraryId}`)
      : favoriteKeys.has(externalKey(food));
    setSelection({ food, libraryId, favorite });
    setAmount(defaultAmount(food, unitSystem));
    setActionError(null);
    setDetailError(null);
    detailRequestKey.current = key;

    if (needsDetail && food.source === "off" && food.barcode) {
      const controller = new AbortController();
      detailAbort.current?.abort();
      detailAbort.current = controller;
      setDetailLoading(true);
      void (async () => {
        try {
          const response = await fetch(
            `/api/foods/barcode?code=${encodeURIComponent(food.barcode ?? "")}`,
            { signal: controller.signal, headers: { Accept: "application/json" } },
          );
          const payload = (await response.json().catch(() => ({}))) as {
            food?: FoodCandidate;
            error?: string;
          };
          if (!response.ok || !payload.food) {
            if (detailRequestKey.current === key) {
              setDetailError(payload.error ?? "search.productError");
            }
            return;
          }
          if (detailRequestKey.current === key) {
            setSelection((current) =>
              current && selectionKey(current.food) === key
                ? { ...current, food: payload.food as FoodCandidate }
                : current,
            );
          }
        } catch {
          if (!controller.signal.aborted && detailRequestKey.current === key) {
            setDetailError("search.productError");
          }
        } finally {
          if (detailRequestKey.current === key) setDetailLoading(false);
        }
      })();
    } else {
      setDetailLoading(false);
    }
  }

  async function toggleFavorite(
    food: Food | FoodCandidate,
    libraryId: string | null,
  ) {
    const key = libraryId ? `id:${libraryId}` : externalKey(food);
    const isFavorite = favoriteKeys.has(key);
    setFavoritePending(key);
    setFavoriteMessage(null);
    try {
      const result =
        libraryId && food.source !== "custom"
          ? await toggleFavoriteAction(libraryId, !isFavorite)
          : libraryId
            ? await toggleFavoriteAction(libraryId, !isFavorite)
            : await saveFavoriteFoodAction(food);
      if (!result.ok) {
        setFavoriteMessage(tr(result.error));
        return;
      }
      setFavoriteKeys((current) => {
        const next = new Set(current);
        if (isFavorite) {
          next.delete(key);
        } else {
          next.add(key);
          if (result.data && "foodId" in result.data) {
            next.add(`id:${result.data.foodId}`);
          }
        }
        return next;
      });
      setSelection((current) =>
        current && selectionKey(current.food) === selectionKey(food)
          ? { ...current, favorite: !isFavorite }
          : current,
      );
      setFavoriteMessage(t(isFavorite ? "foods.unfavorited" : "search.favorited"));
    } catch {
      setFavoriteMessage(t("search.favoriteError"));
    } finally {
      setFavoritePending(null);
    }
  }

  async function lookupBarcode(event: React.FormEvent) {
    event.preventDefault();
    const code = barcode.trim();
    setBarcodeError(null);
    if (!/^[0-9]{6,20}$/.test(code)) {
      setBarcodeError(t("search.invalidBarcode"));
      return;
    }
    setBarcodeLoading(true);
    try {
      const response = await fetch(
        `/api/foods/barcode?code=${encodeURIComponent(code)}`,
        { headers: { Accept: "application/json" } },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        food?: FoodCandidate;
        error?: string;
      };
      if (!response.ok || !payload.food) {
        setBarcodeError(tr(payload.error) ?? t("search.barcodeNotFound"));
        return;
      }
      chooseFood(payload.food, null, false);
    } catch {
      setBarcodeError(t("search.networkError"));
    } finally {
      setBarcodeLoading(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selection || !preview) {
      setActionError(t("search.amountRequired"));
      return;
    }
    const parsed = Number(amount.replace(",", "."));
    const base = toBaseAmount(parsed, selectedUnit);
    setSaving(true);
    setActionError(null);
    try {
      let result;
      if (selection.libraryId) {
        result = await addSavedFoodAction({
          foodId: selection.libraryId,
          date,
          meal,
          amount: base.amount,
          amountUnit: base.amountUnit,
        });
      } else {
        if (selection.food.source === "custom") {
          setActionError(t("food.saveFailed"));
          setSaving(false);
          return;
        }
        result = await addExternalFoodAction({
          food: selection.food,
          date,
          meal,
          amount: base.amount,
          amountUnit: base.amountUnit,
        });
      }
      if (!result.ok) {
        setActionError(tr(result.error) ?? t("food.saveFailed"));
        return;
      }
      onAdded(t("search.added"));
    } catch {
      setActionError(t("food.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const mealLabel = t(`meals.${meal}` as TranslationKey);

  function libraryRow(food: Food) {
    const key = `id:${food.id}`;
    const kcal = food.nutrients.kcal;
    return (
      <div className="result-row" key={key}>
        <button
          type="button"
          className="result-button"
          onClick={() => chooseFood(food, food.id ?? null, false)}
          aria-label={t("search.selectFood", { name: food.name })}
        >
          <span className="food-avatar">
            <Icon name="leaf" size={18} />
          </span>
          <span className="result-main">
            <span className="result-name">{food.name}</span>
            <span className="result-meta">
              {food.brand ? <span>{food.brand}</span> : null}
              <SourceBadge source={food.source} language={language} />
              <span>
                {kcal === null
                  ? t("search.unknown")
                  : `${formatKcal(kcal, language)} kcal`}{" "}
                / {basisLabel(food.basisType, food.servingSize, food.servingUnit)}
              </span>
            </span>
          </span>
          <span className="result-kcal">
            {completeness(food.nutrients, t)}
          </span>
        </button>
        <button
          type="button"
          className="icon-button small ghost"
          aria-label={
            favoriteKeys.has(key) ? t("foods.unfavorite") : t("search.favorite")
          }
          aria-pressed={favoriteKeys.has(key)}
          disabled={favoritePending === key}
          onClick={() => void toggleFavorite(food, food.id ?? null)}
        >
          <Icon
            name={favoriteKeys.has(key) ? "star-filled" : "star"}
            size={17}
          />
        </button>
      </div>
    );
  }

  function renderTabContent() {
    if (tab === "search") {
      return (
        <div className="search-shell">
          {usdaEnabled ? (
            <div className="segmented" role="group" aria-label={t("common.source")}>
              <button
                type="button"
                aria-pressed={source === "off"}
                onClick={() => setSource("off")}
              >
                {t("search.openFoodFacts")}
              </button>
              <button
                type="button"
                aria-pressed={source === "usda"}
                onClick={() => setSource("usda")}
              >
                {t("search.usda")}
              </button>
            </div>
          ) : (
            <p className="source-note">{t("search.offAttribution")}</p>
          )}

          <form
            className="search-bar"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearchTick((value) => value + 1);
            }}
          >
            <label className="sr-only" htmlFor="food-search">
              {t("search.placeholder")}
            </label>
            <input
              id="food-search"
              className="input"
              type="search"
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                if (value.trim().length < 2) {
                  setResults([]);
                  setSearchStatus("idle");
                  setSearchError(null);
                }
              }}
              placeholder={t("search.placeholder")}
              autoComplete="off"
              data-autofocus
            />
            <button type="submit" className="button secondary">
              <Icon name="search" size={17} />
              <span>{t("search.submit")}</span>
            </button>
          </form>

          <form className="barcode-row" onSubmit={lookupBarcode}>
            <div className="field">
              <label htmlFor="barcode">{t("search.barcode")}</label>
              <input
                id="barcode"
                className="input"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                placeholder={t("search.barcodePlaceholder")}
                inputMode="numeric"
                autoComplete="off"
                aria-describedby="barcode-hint barcode-error"
              />
              <p className="field-hint" id="barcode-hint">
                {t("search.barcodeHelp")}
              </p>
              {barcodeError ? (
                <p className="field-error" id="barcode-error" role="alert">
                  {barcodeError}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              className="button secondary"
              disabled={barcodeLoading}
            >
              <Icon name="barcode" size={17} />
              {barcodeLoading ? t("common.loading") : t("search.lookup")}
            </button>
          </form>

          <div aria-live="polite" className="small muted">
            {searchStatus === "loading" ? t("search.loading") : null}
            {searchStatus === "done" && results.length > 0
              ? t("search.resultsCount", { count: results.length })
              : null}
          </div>

          {searchStatus === "idle" ? (
            <p className="source-note">{t("search.startTyping")}</p>
          ) : null}

          {searchStatus === "loading" ? (
            <div className="stack-sm" aria-hidden="true">
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          ) : null}

          {searchStatus === "error" ? (
            <div className="notice error" role="alert">
              <Icon name="alert" size={18} />
              <div className="stack-sm" style={{ gap: 6 }}>
                <span>{tr(searchError) ?? t("search.error")}</span>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => setSearchTick((value) => value + 1)}
                >
                  {t("search.tryAgain")}
                </button>
              </div>
            </div>
          ) : null}

          {searchStatus === "done" && results.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                <Icon name="search" size={22} />
              </span>
              <h3>{t("search.noResults")}</h3>
              <p>{t("search.noResultsHelp")}</p>
              <Link href="/foods" className="button secondary small">
                {t("search.customFoodHint")}
              </Link>
            </div>
          ) : null}

          {results.length > 0 ? (
            <div className="result-list">
              {results.map((food) => {
                const key = externalKey(food);
                return (
                  <div className="result-row" key={key}>
                    <button
                      type="button"
                      className="result-button"
                      onClick={() => chooseFood(food, null, true)}
                      aria-label={t("search.selectFood", { name: food.name })}
                    >
                      <span className="food-avatar">
                        <Icon name="leaf" size={18} />
                      </span>
                      <span className="result-main">
                        <span className="result-name">{food.name}</span>
                        <span className="result-meta">
                          {food.brand ? <span>{food.brand}</span> : null}
                          <SourceBadge source={food.source} language={language} />
                          <span>
                            {food.nutrients.kcal === null
                              ? t("search.unknown")
                              : `${formatKcal(food.nutrients.kcal, language)} kcal`}{" "}
                            /{" "}
                            {basisLabel(
                              food.basisType,
                              food.servingSize,
                              food.servingUnit,
                            )}
                          </span>
                        </span>
                      </span>
                      <span className="result-kcal">
                        {completeness(food.nutrients, t)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button small ghost"
                      aria-label={
                        favoriteKeys.has(key)
                          ? t("foods.unfavorite")
                          : t("search.favorite")
                      }
                      aria-pressed={favoriteKeys.has(key)}
                      disabled={favoritePending === key}
                      onClick={() => void toggleFavorite(food, null)}
                    >
                      <Icon
                        name={favoriteKeys.has(key) ? "star-filled" : "star"}
                        size={17}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <p className="source-note">
            {source === "usda"
              ? t("search.usdaAttribution")
              : t("search.offAttribution")}
          </p>
        </div>
      );
    }

    const list =
      tab === "favorites" ? favorites : tab === "recent" ? recent : customFoods;
    const emptyTitle =
      tab === "favorites"
        ? t("search.noFavorites")
        : tab === "recent"
          ? t("search.noRecent")
          : t("search.noCustom");

    return (
      <div className="search-shell">
        {list.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name={tab === "favorites" ? "star" : "book"} size={22} />
            </span>
            <h3>{emptyTitle}</h3>
            {tab === "custom" ? (
              <Link href="/foods" className="button secondary small">
                {t("search.addCustom")}
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="result-list">{list.map(libraryRow)}</div>
        )}
      </div>
    );
  }

  function renderDetail() {
    if (!selection) return null;
    const food = selection.food;
    const known = NUTRIENT_KEYS.filter((key) => food.nutrients[key] !== null);
    const missing = NUTRIENT_KEYS.filter((key) => food.nutrients[key] === null);
    const energyLabel =
      food.energySource === "calculated"
        ? t("search.energyCalculated")
        : food.energySource === "unknown"
          ? t("search.energyUnknown")
          : t("search.energyProvided");
    const sourceLink =
      food.source === "off" && food.barcode
        ? `https://world.openfoodfacts.org/product/${food.barcode}`
        : null;

    return (
      <div className="stack">
        <div className="row-between">
          <button
            type="button"
            className="button ghost small"
            onClick={() => {
              setSelection(null);
              setActionError(null);
            }}
          >
            <Icon name="arrow-left" size={16} />
            {t("search.backToResults")}
          </button>
          <button
            type="button"
            className="button secondary small"
            aria-pressed={selection.favorite}
            disabled={favoritePending !== null}
            onClick={() =>
              void toggleFavorite(food, selection.libraryId)
            }
          >
            <Icon
              name={selection.favorite ? "star-filled" : "star"}
              size={16}
            />
            {selection.favorite ? t("foods.unfavorite") : t("search.favorite")}
          </button>
        </div>

        <div>
          <h3 style={{ fontSize: "1.25rem" }}>{food.name}</h3>
          <div className="result-meta" style={{ marginTop: 6 }}>
            {food.brand ? <span>{food.brand}</span> : null}
            <SourceBadge source={food.source} language={language} />
            {food.barcode ? <span>{food.barcode}</span> : null}
          </div>
        </div>

        {detailLoading ? (
          <div className="notice" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>{t("search.loadingProduct")}</span>
          </div>
        ) : null}
        {detailError ? (
          <div className="notice warning" role="status">
            <Icon name="info" size={18} />
            <span>
              {tr(detailError)} {t("search.unknownNutrients")}
            </span>
          </div>
        ) : null}
        {favoriteMessage ? (
          <p className="notice success" role="status">
            {favoriteMessage}
          </p>
        ) : null}

        <div className="detail-layout">
          <div className="detail-card">
            <div className="row-between">
              <strong className="small">{t("search.trustTitle")}</strong>
              <span className="badge">
                {t("search.completeness", {
                  known: known.length,
                  total: NUTRIENT_KEYS.length,
                })}
              </span>
            </div>
            <ProgressBar
              value={known.length}
              max={NUTRIENT_KEYS.length}
              label={t("search.completeness", {
                known: known.length,
                total: NUTRIENT_KEYS.length,
              })}
            />
            <div className="kv-list">
              <div className="kv-row">
                <span>{t("search.trustSource")}</span>
                <strong>
                  {food.source === "off"
                    ? t("sources.off")
                    : food.source === "usda"
                      ? t("sources.usda")
                      : t("sources.custom")}
                </strong>
              </div>
              <div className="kv-row">
                <span>{t("search.basis")}</span>
                <strong>
                  {basisLabel(
                    food.basisType,
                    food.servingSize,
                    food.servingUnit,
                  )}
                </strong>
              </div>
              {food.servingSize !== null && food.basisType !== "serving" ? (
                <div className="kv-row">
                  <span>{t("search.servingSize")}</span>
                  <strong>
                    {formatNumber(food.servingSize, language, 2)}{" "}
                    {food.servingUnit === "ml" ? "ml" : "g"}
                  </strong>
                </div>
              ) : null}
              <div className="kv-row">
                <span>{t("search.trustEnergy")}</span>
                <strong>{energyLabel}</strong>
              </div>
              <div className="kv-row">
                <span>{t("nutrients.kj")}</span>
                <strong>
                  {food.nutrients.kj !== null
                    ? `${formatNumber(food.nutrients.kj, language, 0)} kJ`
                    : food.nutrients.kcal !== null
                      ? `≈ ${formatNumber(food.nutrients.kcal * 4.184, language, 0)} kJ`
                      : t("common.unknown")}
                </strong>
              </div>
            </div>

            <div>
              <p className="field-label">{t("search.unknownValues")}</p>
              {missing.length === 0 ? (
                <p className="field-hint">{t("dashboard.nutrientComplete")}</p>
              ) : (
                <div className="unknown-list" style={{ marginTop: 5 }}>
                  {missing.map((key) => (
                    <span className="badge warning" key={key}>
                      {t(`nutrients.${nutrientKeyName(key)}` as TranslationKey)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {sourceLink ? (
              <a
                href={sourceLink}
                target="_blank"
                rel="noopener noreferrer"
                className="button-link"
              >
                {t("search.sourceLink")}
              </a>
            ) : null}
            <p className="source-note">
              {food.source === "custom"
                ? t("sources.customNote")
                : food.source === "usda"
                  ? t("search.usdaAttribution")
                  : t("search.offAttribution")}
            </p>
          </div>

          <form className="detail-card" onSubmit={submit} id="add-food-form">
            <div className="field">
              <label htmlFor="food-amount">{t("search.amount")}</label>
              <div className="row" style={{ alignItems: "stretch" }}>
                <input
                  id="food-amount"
                  className="input"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-describedby="amount-hint"
                  autoComplete="off"
                />
                <span className="badge" style={{ minHeight: 44 }}>
                  {t(unitTranslationKey(selectedUnit))}
                </span>
              </div>
              <p className="field-hint" id="amount-hint">
                {food.basisType === "serving"
                  ? t("search.servingHint")
                  : t("search.amountHint", {
                      unit: t(unitTranslationKey(selectedUnit)),
                    })}
              </p>
            </div>

            <div className="field">
              <label htmlFor="food-meal">{t("search.meal")}</label>
              <select
                id="food-meal"
                className="select"
                value={meal}
                onChange={(event) => setMeal(event.target.value as Meal)}
              >
                {MEALS.map((mealOption) => (
                  <option value={mealOption} key={mealOption}>
                    {t(`meals.${mealOption}` as TranslationKey)}
                  </option>
                ))}
              </select>
            </div>

            <div className="preview-panel">
              <div className="row-between">
                <strong className="small">{t("search.preview")}</strong>
                <span className="small subtle">
                  {basisLabel(
                    food.basisType,
                    food.servingSize,
                    food.servingUnit,
                  )}
                </span>
              </div>
              {preview ? (
                <PreviewNutrients
                  nutrients={preview.nutrients}
                  language={language}
                  energySource={preview.energySource}
                />
              ) : (
                <p className="field-error">{t("search.amountRequired")}</p>
              )}
              <p className="source-note">{t("search.unknownNutrients")}</p>
            </div>

            {actionError ? (
              <p className="notice error" role="alert">
                {actionError}
              </p>
            ) : null}

            <button
              type="submit"
              className="button wide"
              disabled={saving || detailLoading || !preview}
            >
              <Icon name="plus" size={17} />
              {saving ? t("search.saving") : t("search.add")}
            </button>
            <p className="source-note">
              {t("dashboard.addFoodTo", { meal: mealLabel })}
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={selection ? t("search.detailTitle") : t("search.dialogTitle")}
      description={
        selection ? undefined : t("search.dialogDescription")
      }
      size="wide"
      language={language}
    >
      {selection ? (
        renderDetail()
      ) : (
        <div className="search-shell">
          <div className="tab-bar" role="tablist" aria-label={t("search.title")}>
            {(
              [
                ["search", t("search.tabsSearch")],
                ["favorites", t("search.tabsFavorites")],
                ["recent", t("search.tabsRecent")],
                ["custom", t("search.tabsCustom")],
              ] as [SearchTab, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {renderTabContent()}
        </div>
      )}
    </Dialog>
  );
}

function completeness(nutrients: Nutrients, t: ReturnType<typeof getTranslator>) {
  const known = NUTRIENT_KEYS.filter((key) => nutrients[key] !== null).length;
  return t("search.completeness", { known, total: NUTRIENT_KEYS.length });
}

function nutrientKeyName(key: NutrientKey): string {
  switch (key) {
    case "satFat":
      return "saturatedFat";
    default:
      return key;
  }
}

const PREVIEW_KEYS: NutrientKey[] = [
  "kcal",
  "protein",
  "carbs",
  "fat",
  "sugars",
  "satFat",
  "fiber",
  "salt",
];

function PreviewNutrients({
  nutrients,
  language,
  energySource,
}: {
  nutrients: Nutrients;
  language: Language;
  energySource: "provided" | "calculated" | "unknown";
}) {
  const t = getTranslator(language);
  return (
    <div>
      <div className="kv-list">
        {PREVIEW_KEYS.map((key) => {
          const value = nutrients[key];
          const unit =
            key === "kcal" ? "kcal" : key === "salt" ? "g" : "g";
          return (
            <div className="kv-row" key={key}>
              <span>
                {t(`nutrients.${nutrientKeyName(key)}` as TranslationKey)}
              </span>
              <strong>
                {value === null ? (
                  <span className="subtle">{t("common.unknown")}</span>
                ) : (
                  `${formatNumber(
                    value,
                    language,
                    key === "kcal" ? 0 : key === "salt" ? 2 : 1,
                  )} ${unit}`
                )}
              </strong>
            </div>
          );
        })}
      </div>
      {energySource !== "provided" ? (
        <p className="source-note" style={{ marginTop: 8 }}>
          {energySource === "calculated"
            ? t("search.energyCalculated")
            : t("search.energyUnknown")}
        </p>
      ) : null}
    </div>
  );
}
