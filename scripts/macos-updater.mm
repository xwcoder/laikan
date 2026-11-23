#import <Foundation/Foundation.h>
#import <Sparkle/Sparkle.h>
#include <node_api.h>

static napi_value CreateError(napi_env env, NSString *reason) {
  napi_value message, error;
  napi_create_string_utf8(env, reason.UTF8String, NAPI_AUTO_LENGTH, &message);
  napi_create_error(env, nullptr, message, &error);
  return error;
}

@interface YikanUpdater : NSObject <SPUUpdaterDelegate, SPUUserDriver>
@property (nonatomic, strong) SPUUpdater *updater;
@property (nonatomic) napi_env env;
@property (nonatomic) napi_deferred deferred;
@property (nonatomic) napi_ref progress;
@property (nonatomic, copy) NSString *requestedVersion;
@property (nonatomic, copy) NSString *availableVersion;
@property (nonatomic) BOOL installing;
@property (nonatomic) uint64_t expectedBytes;
@property (nonatomic) uint64_t receivedBytes;
- (napi_value)startWithVersion:(NSString *)version progress:(napi_value)progress;
@end

@implementation YikanUpdater

- (napi_value)startWithVersion:(NSString *)version progress:(napi_value)progress {
  napi_value promise;
  napi_deferred deferred;
  napi_create_promise(self.env, &deferred, &promise);
  if (self.deferred || !self.updater.canCheckForUpdates) {
    napi_reject_deferred(self.env, deferred, CreateError(self.env, @"An update check is already in progress"));
    return promise;
  }

  self.deferred = deferred;
  self.requestedVersion = version;
  self.availableVersion = nil;
  self.installing = NO;
  if (progress) napi_create_reference(self.env, progress, 1, &_progress);

  if (version) [self.updater checkForUpdates];
  else [self.updater checkForUpdateInformation];
  return promise;
}

- (void)finishWithError:(NSString *)error {
  napi_env env = self.env;
  napi_deferred deferred = self.deferred;
  if (!env || !deferred) return;

  NSString *version = self.requestedVersion ? nil : self.availableVersion;
  self.deferred = nullptr;
  self.requestedVersion = nil;
  self.availableVersion = nil;
  if (self.progress) {
    napi_delete_reference(env, self.progress);
    self.progress = nullptr;
  }

  napi_handle_scope scope;
  if (napi_open_handle_scope(env, &scope) != napi_ok) return;
  if (error) {
    napi_reject_deferred(env, deferred, CreateError(env, error));
  } else {
    napi_value value;
    if (version) napi_create_string_utf8(env, version.UTF8String, NAPI_AUTO_LENGTH, &value);
    else napi_get_undefined(env, &value);
    napi_resolve_deferred(env, deferred, value);
  }
  napi_close_handle_scope(env, scope);
}

- (BOOL)updater:(SPUUpdater *)updater mayPerformUpdateCheck:(SPUUpdateCheck)check error:(NSError **)error {
  // Only checks initiated by Yikan may access the feed.
  return self.deferred != nullptr;
}

- (void)updater:(SPUUpdater *)updater didFindValidUpdate:(SUAppcastItem *)item {
  if (!item.informationOnlyUpdate) self.availableVersion = item.displayVersionString;
}

- (BOOL)updater:(SPUUpdater *)updater shouldDownloadReleaseNotesForUpdate:(SUAppcastItem *)item {
  return NO;
}

- (void)updater:(SPUUpdater *)updater didFinishUpdateCycleForUpdateCheck:(SPUUpdateCheck)check error:(NSError *)error {
  BOOL noUpdate = [error.domain isEqualToString:SUSparkleErrorDomain] && error.code == SUNoUpdateError;
  if (error && (self.requestedVersion || !noUpdate)) {
    [self finishWithError:error.localizedDescription];
  } else if (self.requestedVersion && !self.installing) {
    [self finishWithError:@"The selected update is no longer available"];
  } else {
    [self finishWithError:nil];
  }
}

- (void)showUpdatePermissionRequest:(SPUUpdatePermissionRequest *)request
                              reply:(void (^)(SUUpdatePermissionResponse *))reply {
  reply([[SUUpdatePermissionResponse alloc] initWithAutomaticUpdateChecks:NO sendSystemProfile:NO]);
}

- (void)showUserInitiatedUpdateCheckWithCancellation:(void (^)(void))cancellation {}

- (void)showUpdateFoundWithAppcastItem:(SUAppcastItem *)item state:(SPUUserUpdateState *)state
                                reply:(void (^)(SPUUserUpdateChoice))reply {
  BOOL accepted = !item.informationOnlyUpdate && [self.requestedVersion isEqualToString:item.displayVersionString];
  reply(accepted ? SPUUserUpdateChoiceInstall : SPUUserUpdateChoiceDismiss);
}

- (void)showUpdateReleaseNotesWithDownloadData:(SPUDownloadData *)data {}
- (void)showUpdateReleaseNotesFailedToDownloadWithError:(NSError *)error {}
- (void)showUpdateNotFoundWithError:(NSError *)error acknowledgement:(void (^)(void))acknowledge { acknowledge(); }
- (void)showUpdaterError:(NSError *)error acknowledgement:(void (^)(void))acknowledge { acknowledge(); }

- (void)showDownloadInitiatedWithCancellation:(void (^)(void))cancellation {
  self.expectedBytes = 0;
  self.receivedBytes = 0;
}

- (void)showDownloadDidReceiveExpectedContentLength:(uint64_t)length {
  self.expectedBytes = length;
}

- (void)showDownloadDidReceiveDataOfLength:(uint64_t)length {
  self.receivedBytes += length;
  if (!self.env || !self.progress || !self.expectedBytes) return;

  napi_env env = self.env;
  napi_handle_scope scope;
  if (napi_open_handle_scope(env, &scope) != napi_ok) return;
  napi_value callback, receiver, percent;
  napi_get_reference_value(env, self.progress, &callback);
  napi_get_global(env, &receiver);
  napi_create_double(env, 100.0 * self.receivedBytes / self.expectedBytes, &percent);
  napi_make_callback(env, nullptr, receiver, callback, 1, &percent, nullptr);
  napi_close_handle_scope(env, scope);
}

- (void)showDownloadDidStartExtractingUpdate {}
- (void)showExtractionReceivedProgress:(double)progress {}

- (void)showReadyToInstallAndRelaunch:(void (^)(SPUUserUpdateChoice))reply {
  self.installing = self.requestedVersion != nil;
  reply(self.installing ? SPUUserUpdateChoiceInstall : SPUUserUpdateChoiceSkip);
}

- (void)showInstallingUpdateWithApplicationTerminated:(BOOL)terminated
                           retryTerminatingApplication:(void (^)(void))retry {}

- (void)showUpdateInstalledAndRelaunched:(BOOL)relaunched acknowledgement:(void (^)(void))acknowledge {
  acknowledge();
}

- (void)dismissUpdateInstallation {}
@end

static napi_value Check(napi_env env, napi_callback_info info) {
  void *data;
  napi_get_cb_info(env, info, nullptr, nullptr, nullptr, &data);
  return [(__bridge YikanUpdater *)data startWithVersion:nil progress:nullptr];
}

static napi_value Install(napi_env env, napi_callback_info info) {
  size_t count = 2;
  napi_value args[2];
  void *data;
  char version[257];
  napi_valuetype progressType;
  napi_get_cb_info(env, info, &count, args, nullptr, &data);
  if (count != 2 || napi_get_value_string_utf8(env, args[0], version, sizeof(version), nullptr) != napi_ok ||
      napi_typeof(env, args[1], &progressType) != napi_ok || progressType != napi_function) {
    napi_throw_type_error(env, nullptr, "Expected a version and a progress callback");
    return nullptr;
  }
  return [(__bridge YikanUpdater *)data startWithVersion:[NSString stringWithUTF8String:version] progress:args[1]];
}

static void Cleanup(void *data) {
  YikanUpdater *controller = (__bridge_transfer YikanUpdater *)data;
  controller.env = nullptr;
  controller.updater = nil;
}

static napi_value Initialize(napi_env env, napi_value exports) {
  YikanUpdater *controller = [YikanUpdater new];
  controller.env = env;
  NSBundle *bundle = NSBundle.mainBundle;
  controller.updater = [[SPUUpdater alloc] initWithHostBundle:bundle applicationBundle:bundle
                                                userDriver:controller delegate:controller];
  NSError *error;
  if (![controller.updater startUpdater:&error]) {
    controller.updater = nil;
    napi_throw_error(env, nullptr, error.localizedDescription.UTF8String);
    return nullptr;
  }

  void *data = (__bridge_retained void *)controller;
  napi_add_env_cleanup_hook(env, Cleanup, data);
  napi_property_descriptor properties[] = {
    { "check", nullptr, Check, nullptr, nullptr, nullptr, napi_default, data },
    { "install", nullptr, Install, nullptr, nullptr, nullptr, napi_default, data },
  };
  napi_define_properties(env, exports, 2, properties);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
