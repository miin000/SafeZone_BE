import {
  CirculationLevel,
  DiseaseGroup,
  scoreDisease,
  TransmissionRoute,
} from './disease-scoring';

const base = {
  transmissionRoutes: [TransmissionRoute.RESPIRATORY],
  r0: 3,
  hasVaccine: true,
  hasSpecificTreatment: true,
  circulationLevel: CirculationLevel.STABLE_OR_SPORADIC,
  isNovelSpecialDangerous: false,
};

describe('scoreDisease', () => {
  it.each([
    [0.99, 1],
    [1, 2],
    [10, 2],
    [10.01, 3],
  ])('scores case fatality rate %p as %p', (rate, expected) => {
    expect(scoreDisease({ ...base, caseFatalityRate: rate }).c1).toBe(expected);
  });

  it('uses the higher respiratory score when R0 exceeds 3', () => {
    expect(scoreDisease({ ...base, caseFatalityRate: 1, r0: 3 }).c2).toBe(2);
    expect(scoreDisease({ ...base, caseFatalityRate: 1, r0: 3.01 }).c2).toBe(3);
  });

  it('assigns the novel dangerous exception to group A', () => {
    expect(
      scoreDisease({
        ...base,
        caseFatalityRate: 0,
        isNovelSpecialDangerous: true,
      }).group,
    ).toBe(DiseaseGroup.A);
  });
});
