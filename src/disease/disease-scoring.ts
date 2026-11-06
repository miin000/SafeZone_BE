export enum DiseaseGroup {
  A = 'A',
  B = 'B',
  C = 'C',
}

export enum TransmissionRoute {
  BLOOD = 'blood',
  SKIN = 'skin',
  MUCOSA = 'mucosa',
  ANIMAL_TO_HUMAN = 'animal_to_human',
  DIGESTIVE = 'digestive',
  RESPIRATORY = 'respiratory',
}

export enum CirculationLevel {
  STABLE_OR_SPORADIC = 'stable_or_sporadic',
  LARGE_OUTBREAK_OR_EMERGING = 'large_outbreak_or_emerging',
  PANDEMIC_RISK_OR_ELIMINATION_TARGET = 'pandemic_risk_or_elimination_target',
}

export interface DiseaseScoringAttributes {
  caseFatalityRate: number;
  transmissionRoutes: TransmissionRoute[];
  r0: number;
  hasVaccine: boolean;
  hasSpecificTreatment: boolean;
  circulationLevel: CirculationLevel;
  isNovelSpecialDangerous: boolean;
}

export interface DiseaseScore {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  sd: number;
  group: DiseaseGroup;
}

export function scoreDisease(
  attrs: DiseaseScoringAttributes,
): DiseaseScore {
  if (
    !Number.isFinite(attrs.caseFatalityRate) ||
    attrs.caseFatalityRate < 0 ||
    attrs.caseFatalityRate > 100
  ) {
    throw new Error('caseFatalityRate must be between 0 and 100');
  }
  if (!Number.isFinite(attrs.r0) || attrs.r0 < 0) {
    throw new Error('r0 must be a non-negative number');
  }
  if (!attrs.transmissionRoutes?.length) {
    throw new Error('At least one transmission route is required');
  }

  const c1 =
    attrs.caseFatalityRate < 1
      ? 1
      : attrs.caseFatalityRate <= 10
        ? 2
        : 3;
  const hasRespiratoryOrDigestive = attrs.transmissionRoutes.some(
    (route) =>
      route === TransmissionRoute.RESPIRATORY ||
      route === TransmissionRoute.DIGESTIVE,
  );
  const c2 = hasRespiratoryOrDigestive ? (attrs.r0 <= 3 ? 2 : 3) : 1;
  const c3 =
    attrs.hasVaccine && attrs.hasSpecificTreatment
      ? 1
      : attrs.hasVaccine || attrs.hasSpecificTreatment
        ? 2
        : 3;
  const c4 =
    attrs.circulationLevel === CirculationLevel.STABLE_OR_SPORADIC
      ? 1
      : attrs.circulationLevel === CirculationLevel.LARGE_OUTBREAK_OR_EMERGING
        ? 2
        : 3;
  const sd = c1 + c2 + c3 + c4;

  return {
    c1,
    c2,
    c3,
    c4,
    sd,
    group:
      attrs.isNovelSpecialDangerous || sd >= 10
        ? DiseaseGroup.A
        : sd >= 7
          ? DiseaseGroup.B
          : DiseaseGroup.C,
  };
}
