const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * Adopts the UIScene life cycle required by the latest iOS SDK (TN3187).
 * Expo SDK 57 templates still use the AppDelegate-owned window, which
 * fails to launch when built with current Xcode (expo/expo#46663).
 * Remove once Expo ships scene-based templates (expo/expo#46733).
 */

const WINDOW_BLOCK = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)`;

const WINDOW_BLOCK_REPLACEMENT = `// Window creation moved to SceneDelegate (UIScene life cycle, TN3187)
    self.launchOptions = launchOptions

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)`;

const LAUNCH_OPTIONS_PROP = `  var reactNativeFactory: RCTReactNativeFactory?
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?`;

const SCENE_DELEGATE = `

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)
  }

  // Forward deep links so Linking keeps working under the scene life cycle
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(UIApplication.shared, continue: userActivity) { _ in }
  }
}
`;

function modifyAppDelegate(contents) {
  if (contents.includes('class SceneDelegate')) return contents;

  if (!contents.includes(WINDOW_BLOCK)) {
    throw new Error(
      'withSceneLifecycle: AppDelegate.swift does not match the expected Expo SDK 57 template. ' +
        'The Expo SDK may have changed — check whether this plugin is still needed.'
    );
  }
  contents = contents.replace(WINDOW_BLOCK, WINDOW_BLOCK_REPLACEMENT);
  contents = contents.replace('  var reactNativeFactory: RCTReactNativeFactory?', LAUNCH_OPTIONS_PROP);
  contents += SCENE_DELEGATE;
  return contents;
}

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return config;
  });

  config = withAppDelegate(config, (config) => {
    config.modResults.contents = modifyAppDelegate(config.modResults.contents);
    return config;
  });

  return config;
};
