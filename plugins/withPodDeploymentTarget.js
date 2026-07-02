const { withPodfile } = require('expo/config-plugins');

const MIN_IOS = '16.4';
const MARKER = '# [apexis] enforce minimum deployment target on all pods';

/**
 * Some pods (e.g. RNCAsyncStorage's resource bundle) pin an
 * IPHONEOS_DEPLOYMENT_TARGET older than what current Xcode accepts.
 * `platform :ios` in the Podfile does not override podspec-level targets,
 * so raise them all in post_install.
 */
module.exports = function withPodDeploymentTarget(config) {
  return withPodfile(config, (config) => {
    if (config.modResults.contents.includes(MARKER)) return config;
    config.modResults.contents = config.modResults.contents.replace(
      'post_install do |installer|',
      `post_install do |installer|
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && current.to_f < ${MIN_IOS}
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS}'
        end
      end
    end`
    );
    return config;
  });
};
