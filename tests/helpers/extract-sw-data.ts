import vm from 'node:vm';

export interface SwData {
  assets: {
    main: string[];
    additional: string[];
    optional: string[];
  };
  externals: string[];
  hashesMap: Record<string, string>;
  strategy: string;
  responseStrategy: string;
  version: string;
  name: string;
  pluginVersion?: string;
  relativePaths: boolean;
  prefetchRequest?: {
    credentials?: string;
    headers?: any;
    mode?: string;
    cache?: string;
  };
}

export function extractSwData(swSource: string): SwData {
  const context: any = {};
  vm.runInNewContext(swSource, context);
  return context.__wpo;
}
