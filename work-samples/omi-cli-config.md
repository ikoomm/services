# Python CLI bug fix: preserve user configuration

**Problem.** In Omi's Python CLI, changing one known setting could remove unrelated top-level entries from `config.toml`. A user needed the requested edit without losing other settings.

**Solution.** I reproduced the loss with a synthetic configuration, updated the loader and writer to round-trip unknown root fields while keeping documented fields authoritative, and added a regression test that runs the real `omi config set` command. The test checks that the requested value, an unrelated scalar, and an unrelated table all survive.

**Evidence.** [The upstream pull request](https://github.com/BasedHardware/omi/pull/12990) was reviewed and merged on 8 September 2026. [The diff](https://github.com/BasedHardware/omi/pull/12990/files) contains the code, CLI regression test, and README update. The author reported 130 passing CLI tests on Windows/Python 3.12; a [reviewer independently confirmed](https://github.com/BasedHardware/omi/pull/12990#issuecomment-5578279718) that the regression failed on the base revision and passed on the submitted change. These are historical checks of that contribution, not a claim that the current full Omi suite was rerun here.

**Where this applies.** Focused Python CLI and configuration fixes where preserving existing data matters. This is an open-source contribution, not a paid client engagement or a claim about all future TOML extensions.
