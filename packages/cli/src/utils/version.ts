import { DepsService } from '../services/service.deps';

class VersionService {
  private static instance: VersionService | undefined;
  private depsService: DepsService;
  private versionCache: string | undefined;

  private constructor() {
    this.depsService = new DepsService();
  }

  static getInstance(): VersionService {
    if (!VersionService.instance) {
      VersionService.instance = new VersionService();
    }
    return VersionService.instance;
  }

  async getVersion(): Promise<string> {
    if (this.versionCache === undefined) {
      this.versionCache = await this.depsService.getPackageVersion();
    }
    return this.versionCache;
  }

  getDepsService(): DepsService {
    return this.depsService;
  }
}

export const getVersion = (): Promise<string> => VersionService.getInstance().getVersion();
