# Checks the one-click templates in deploy/ agree with the app and each other.
#
# Run by .github/workflows/install-recipes.yml (`ruby scripts/check-install-templates.rb`).
# Each template must run the published image, keep /data, reach port 3000
# and only set settings its stack reads.
require 'json'
require 'yaml'

ROOT = File.expand_path('..', __dir__)
IMAGE = 'ghcr.io/itsmemeworks/adhx:latest'
RAW = 'https://raw.githubusercontent.com/itsmemeworks/adhx/main/'
$problems = []

def check(ok, message)
  $problems << message unless ok
end

def read(path)
  File.read(File.join(ROOT, path), encoding: 'UTF-8')
end

def load(path)
  YAML.safe_load(read(path))
end

# Portainer: a Compose stack from this repository.
portainer = JSON.parse(read('deploy/portainer/templates.json'))
check(portainer['version'] == '2', "portainer: version must be '2'")
check(portainer['templates'].size == 1, 'portainer: expected one template')
template = portainer['templates'].first
check(template['type'] == 3, 'portainer: must be a Compose stack (type 3)')
repo = template['repository']
check(repo['url'] == 'https://github.com/itsmemeworks/adhx', 'portainer: wrong repository')
stack = File.join(ROOT, repo['stackfile'])
if File.file?(stack)
  compose = File.read(stack, encoding: 'UTF-8')
  template.fetch('env', []).each do |env|
    check(compose.include?("${#{env['name']}"), "portainer: #{env['name']} is not used by the stack")
  end
else
  check(false, "portainer: #{repo['stackfile']} does not exist")
end
logo = template['logo']
check(logo.start_with?(RAW) && File.file?(File.join(ROOT, logo.sub(RAW, ''))),
      'portainer: the logo must be a file in this repository')

# CapRover: the one-click app format.
caprover = load('deploy/caprover/adhx.yml')
check(caprover['captainVersion'] == 4, 'caprover: captainVersion must be 4')
service = caprover['services']['$$cap_appname']
check(service['image'] == IMAGE, 'caprover: wrong image')
check(service['volumes'].any? { |v| v.end_with?(':/data') }, 'caprover: /data is not kept')
check(service['caproverExtra']['containerHttpPort'] == '3000', 'caprover: port must be 3000')
declared = caprover['caproverOneClickApp']['variables'].map { |v| v['id'] }
builtins = %w[$$cap_appname $$cap_root_domain $$cap_gen_random_hex]
used = read('deploy/caprover/adhx.yml').scan(/\$\$cap_[a-z_]+/).uniq
missing = used - declared - builtins
check(missing.empty?, "caprover: undeclared #{missing.join(', ')}")

# Zeabur: a template for the owner to publish.
zeabur = load('deploy/zeabur/template.yaml')
check(zeabur['kind'] == 'Template', 'zeabur: kind must be Template')
spec = zeabur['spec']['services'].first['spec']
check(spec['source']['image'] == IMAGE, 'zeabur: wrong image')
# The app reads ZEABUR_WEB_URL, which Zeabur names after the port id.
check(spec['ports'].any? { |p| p['id'] == 'web' && p['port'] == 3000 && p['type'] == 'HTTP' },
      "zeabur: needs an HTTP port 3000 with the id 'web'")
check(spec['volumes'].any? { |v| v['dir'] == '/data' }, 'zeabur: /data is not kept')

# Render: the existing button.
web = load('render.yaml')['services'].first
check(web['image']['url'] == IMAGE, 'render: wrong image')
check(web['disk']['mountPath'] == '/data', 'render: /data is not kept')

# cloud-init: writes the installer's settings, then runs it from main.
text = read('deploy/cloud-init.yaml')
check(text.start_with?("#cloud-config\n"), 'cloud-init: must start with #cloud-config')
cloud = YAML.safe_load(text)
env_file = cloud['write_files'].first
check(env_file['path'] == '/opt/adhx/.env', 'cloud-init: settings must go to /opt/adhx/.env')
%w[ADHX_DOMAIN= SETUP_CODE=].each do |key|
  check(env_file['content'].lines.any? { |l| l.start_with?(key) }, "cloud-init: #{key} is missing")
end
check(cloud['runcmd'].any? { |c| c.to_s.include?("#{RAW}deploy/install.sh") },
      'cloud-init: must run the installer from main')

abort($problems.join("\n")) unless $problems.empty?
puts 'install templates: all agree'
