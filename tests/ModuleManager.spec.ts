import 'mocha';
import sinon from 'sinon';
import { expect } from 'chai';
import { bindTestStubs, unbindTestStubs, loadDefaultTestConfig, awaitSleepPromise } from './common';
import { ServiceManager } from '../src/common/ServiceManager';
import { FaucetDatabase } from '../src/db/FaucetDatabase';
import { ModuleHookAction, ModuleManager } from '../src/modules/ModuleManager';
import { SessionManager } from '../src/session/SessionManager';
import { faucetConfig } from '../src/config/FaucetConfig';
import { FaucetError } from '../src/common/FaucetError';
import { FaucetSession, FaucetSessionStatus } from '../src/session/FaucetSession';
import { MODULE_CLASSES } from '../src/modules/modules';
import { FaucetProcess } from '../src/common/FaucetProcess';
import { BaseModule } from '../src/modules/BaseModule';
import { FakeProvider } from './stubs/FakeProvider';
import { IEnsNameConfig } from '../src/modules/ensname/EnsNameConfig';
import { IMainnetWalletConfig } from '../src/modules/mainnet-wallet/MainnetWalletConfig';


describe("Faucet Module Management", () => {
  let globalStubs;
  let fakeProvider;

  beforeEach(async () => {
    globalStubs = bindTestStubs();
    fakeProvider = new FakeProvider();
    fakeProvider.injectResponse("net_version", "5");
    loadDefaultTestConfig();
    await ServiceManager.GetService(FaucetDatabase).initialize();
  });
  afterEach(async () => {
    let dbService = ServiceManager.GetService(FaucetDatabase);
    await ServiceManager.DisposeAllServices();
    await dbService.closeDatabase();
    await unbindTestStubs(globalStubs);
  });

  it("Load & unload modules", async () => {
    let moduleManager = ServiceManager.GetService(ModuleManager);
    await moduleManager.initialize();

    let allModules = Object.keys(MODULE_CLASSES);
    allModules.forEach((module) => {
      faucetConfig.modules[module] = { enabled: true };
      switch(module) {
        case "ensname":
          (faucetConfig.modules[module] as IEnsNameConfig).rpcHost = fakeProvider;
          break;
        case "mainnet-wallet":
          (faucetConfig.modules[module] as IMainnetWalletConfig).rpcHost = fakeProvider;
          break;
        
      }
    });
    faucetConfig.modules["inv_al_id"] = { enabled: true };
    ServiceManager.GetService(FaucetProcess).emit("reload");
    await moduleManager.getLoadingPromise();
    ServiceManager.GetService(FaucetProcess).emit("reload");
    await moduleManager.getLoadingPromise();
    allModules.forEach((module) => {
      let modObj = moduleManager.getModule<BaseModule>(module);
      expect(!!modObj).to.equal(true, "module not loaded: " + module);
      expect(modObj.isEnabled()).to.equal(true, "module not enabled: " + module);
      expect(modObj.getModuleName()).to.equal(module, "module name missmatch: " + module);
      faucetConfig.modules[module].enabled = false;
    });
    ServiceManager.GetService(FaucetProcess).emit("reload");
    await moduleManager.getLoadingPromise();
    allModules.forEach((module) => {
      let modObj = moduleManager.getModule<BaseModule>(module);
      expect(!!modObj).to.equal(false, "module still loaded: " + module);
    });
  }).timeout(5000);

  it("Module lifecycle", async () => {
    let moduleManager = ServiceManager.GetService(ModuleManager);
    await moduleManager.initialize();

    faucetConfig.modules["captcha"] = { enabled: true };
    faucetConfig.modules["ipinfo"] = { enabled: true };
    ServiceManager.GetService(FaucetProcess).emit("reload");
    await moduleManager.getLoadingPromise();
    let captchaModule = moduleManager.getModule<BaseModule>("captcha");

    let error: Error;
    try {
      await captchaModule.enableModule();
    } catch(ex) {
      error = ex;
    }
    expect(!!error).to.equal(true, "no error thrown when enabling already enabled module");

    faucetConfig.modules["captcha"].enabled = false;
    ServiceManager.GetService(FaucetProcess).emit("reload");
    await moduleManager.getLoadingPromise();

    error = null;
    try {
      await captchaModule.disableModule();
    } catch(ex) {
      error = ex;
    }
    expect(!!error).to.equal(true, "no error thrown when disabling already disabled module");    
  });

  
});
