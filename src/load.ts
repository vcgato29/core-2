import Promise from '@dojo/shim/Promise';
import { Require } from '@dojo/interfaces/loader';
import { isPlugin, useDefault } from './load/util';

declare const require: Require;

declare const define: {
	(...args: any[]): any;
	amd: any;
};

export interface NodeRequire {
	(moduleId: string): any;
}

export type Require = Require | NodeRequire;

export interface Load {
	(require: Require, ...moduleIds: string[]): Promise<any[]>;
	(...moduleIds: string[]): Promise<any[]>;
}

const load: Load = (function (): Load {
	const resolver = typeof require.toUrl === 'function' ? require.toUrl :
		typeof (<any> require).resolve === 'function' ? (<any> require).resolve :
		(resourceId: string) => resourceId;

	function pluginLoad(moduleIds: string[], load: Load, loader: (modulesIds: string[]) => Promise<any>) {
		const pluginResourceIds: string[] = [];
		moduleIds = moduleIds.map((id: string, i: number) => {
			const parts = id.split('!');
			pluginResourceIds[i] = parts[1];
			return parts[0];
		});

		return loader(moduleIds).then((modules: any[]) => {
			pluginResourceIds.forEach((resourceId: string, i: number) => {
				if (typeof resourceId === 'string') {
					const module = modules[i];
					const defaultExport = module['default'] || module;

					if (isPlugin(defaultExport)) {
						resourceId = typeof defaultExport.normalize === 'function' ?
							defaultExport.normalize(resourceId, resolver) :
							resolver(resourceId);

						modules[i] = defaultExport.load(resourceId, load);
					}
				}
			});

			return Promise.all(modules);
		});
	}

	if (typeof module === 'object' && typeof module.exports === 'object') {
		return function load(contextualRequire: any, ...moduleIds: string[]): Promise<any[]> {
			if (typeof contextualRequire === 'string') {
				moduleIds.unshift(contextualRequire);
				contextualRequire = require;
			}

			return pluginLoad(moduleIds, load, (moduleIds: string[]) => {
				try {
					return Promise.resolve(moduleIds.map(function (moduleId): any {
						return contextualRequire(moduleId.split('!')[0]);
					}));
				}
				catch (error) {
					return Promise.reject(error);
				}
			});
		};
	}
	else if (typeof define === 'function' && define.amd) {
		return function load(contextualRequire: any, ...moduleIds: string[]): Promise<any[]> {
			if (typeof contextualRequire === 'string') {
				moduleIds.unshift(contextualRequire);
				contextualRequire = require;
			}

			return pluginLoad(moduleIds, load, (moduleIds: string[]) => {
				return new Promise(function (resolve, reject) {
					let errorHandle: { remove: () => void };

					if (typeof contextualRequire.on === 'function') {
						errorHandle = contextualRequire.on('error', (error: Error) => {
							errorHandle.remove();
							reject(error);
						});
					}

					contextualRequire(moduleIds, function (...modules: any[]) {
						errorHandle && errorHandle.remove();
						resolve(modules);
					});
				});
			});
		};
	}
	else {
		return function () {
			return Promise.reject(new Error('Unknown loader'));
		};
	}
})();
export default load;

export {
	isPlugin,
	useDefault
}
