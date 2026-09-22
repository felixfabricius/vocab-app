# Adds the app's own Swift sources (ViewController.swift, Plugins/*.swift) to the App
# target. Runs in CI after `cap sync` (`bundle exec ruby scripts/ios/sync-project.rb`);
# the committed template project does not know these files and Xcode is not available
# on Windows to add them. Idempotent. Retired when xcodegen takes over (PLAN-NATIVE M6).
require "xcodeproj"

root = File.expand_path("../..", __dir__)
project_path = File.join(root, "ios/App/App.xcodeproj")
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == "App" } or abort "No App target"
app_group = project.main_group["App"] or abort "No App group"

known = target.source_build_phase.files.map { |f| f.file_ref&.real_path.to_s }
plugins_group = app_group["Plugins"] || app_group.new_group("Plugins", "Plugins")

added = []
(Dir[File.join(root, "ios/App/App/ViewController.swift")] + Dir[File.join(root, "ios/App/App/Plugins/*.swift")]).sort.each do |abs|
  next if known.include?(abs)
  group = abs.include?("/Plugins/") ? plugins_group : app_group
  ref = group.new_file(File.basename(abs))
  target.add_file_references([ref])
  added << File.basename(abs)
end

project.save
puts added.empty? ? "sync-project: nothing to add" : "sync-project: added #{added.join(', ')}"
