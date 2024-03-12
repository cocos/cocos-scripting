
import { StatsQuery } from '@ccbuild/stats-query';
import ConstantManager = StatsQuery.ConstantManager;
type PlatformType = ConstantManager.PlatformType;
type BuildTimeConstants = ConstantManager.BuildTimeConstants;
type CCEnvConstants = ConstantManager.CCEnvConstants;
type IBuildTimeConstantValue = StatsQuery.ConstantManager.ValueType;

export { BuildTimeConstants, CCEnvConstants };

interface BuildConstantsOption {
    platform: PlatformType | string;
    flags: Record<string, IBuildTimeConstantValue>;
}

export async function getCCEnvConstants(options: BuildConstantsOption): Promise<ConstantManager.CCEnvConstants> {
    //TODO(cjh): const engineRoot = (await Editor.Message.request('engine', 'query-engine-info')).typescript.path;
    const engineRoot = '';
    const statsQuery = await StatsQuery.create(engineRoot);
    return statsQuery.constantManager.genCCEnvConstants({
        mode: 'BUILD',
        platform: options.platform as PlatformType,
        flags: options.flags ?? {},
    });
}
