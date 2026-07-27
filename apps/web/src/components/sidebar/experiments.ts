/**
 * Temporary, device-local UI experiments.
 *
 * These are deliberately localStorage flags rather than client settings: they
 * exist to compare an upstream treatment against ours in a running build, and
 * they get deleted — along with the losing branch — once the comparison is
 * settled. Keeping them out of `ClientSettingsSchema` keeps that throwaway
 * decision out of a contract file upstream also edits.
 */
export const PROJECT_STATUS_INDICATOR_EXPERIMENT_KEY = "experiment_project_status_indicator";
