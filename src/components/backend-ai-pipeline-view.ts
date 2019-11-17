/**
 @license
 Copyright (c) 2015-2019 Lablup Inc. All rights reserved.
 */

 /*
  Assumptions on the vFolder structure for storing pipeline configs and data.

  /home/work/config.json  # pipeline configuration file which stores following fields
    - title
    - description
    - environment
    - version
    - scaling_group
    - folder_host
  /home/work/components.json  # stores whole pipeline components
    - title
    - description
    - path  # eg) /home/work/001-load-data/
            # code is assumed to be stored in `main.py` inside `path`
    - cpu
    - mem
    - gpu
    - executed
  /home/work/001-load-data/      # root path for each pipeline component
  /home/work/002-validate-data/
  ...
  */

import {css, customElement, html, property} from "lit-element";
import {BackendAIPage} from './backend-ai-page';

import {setPassiveTouchGestures} from '@polymer/polymer/lib/utils/settings';
import '@polymer/paper-icon-button/paper-icon-button';
import '@polymer/iron-icon/iron-icon';
import '@polymer/iron-icons/iron-icons';

import '@polymer/paper-dialog/paper-dialog';
import '@polymer/paper-button/paper-button';
import '@polymer/paper-listbox/paper-listbox';
import '@polymer/paper-checkbox/paper-checkbox';
import '@polymer/paper-dropdown-menu/paper-dropdown-menu';
import '@polymer/paper-slider/paper-slider';
import '@polymer/paper-item/paper-item';

import Sortable from 'sortablejs';
import '@vaadin/vaadin-dialog/vaadin-dialog';
import 'weightless/button';
import 'weightless/icon';
import 'weightless/dialog';
import 'weightless/expansion';
import 'weightless/card';
import 'weightless/tab';
import 'weightless/tab-group';
import 'weightless/list-item';
import 'weightless/divider';
import 'weightless/textfield';

import {BackendAiStyles} from './backend-ai-console-styles';
import {
  IronFlex,
  IronFlexAlignment,
  IronFlexFactors,
  IronPositioning
} from '../plastics/layout/iron-flex-layout-classes';
import {default as PainKiller} from './backend-ai-painkiller';
import './backend-ai-session-list';
import './backend-ai-dropdown-menu';
import './lablup-codemirror';
import './lablup-loading-indicator';

@customElement("backend-ai-pipeline-view")
export default class BackendAIPipelineView extends BackendAIPage {
  public shadowRoot: any;
  public notification: any;
  public updateComplete: any;
  public $: any;

  public indicator: any;

  @property({type: Object}) supports = Object();
  @property({type: Object}) aliases = Object();
  @property({type: Object}) images = Object();
  @property({type: Object}) tags = Object();
  @property({type: Object}) humanizedNames = Object();
  @property({type: Array}) versions = Array();
  @property({type: Array}) languages = Array();
  @property({type: String}) defaultLanguage = '';
  @property({type: Object}) resourceLimits = Object();
  @property({type: String}) scalingGroup = '';
  @property({type: Array}) scalingGroups = Array();
  @property({type: String}) vhost = '';
  @property({type: Array}) vhosts = Array();
  @property({type: String}) _status = 'inactive';
  @property({type: String}) pipelineCreateMode = 'create';
  @property({type: String}) componentCreateMode = 'create';
  @property({type: Array}) pipelineFolderList = Array();
  /* Properties for selected pipeline */
  @property({type: String}) pipelineFolderName = '';
  @property({type: Object}) pipelineConfig = Object();
  @property({type: Array}) pipelineComponents = Array();
  @property({type: Number}) selectedComponentIndex = -1;

  constructor() {
    super();
    setPassiveTouchGestures(true);
    this.active = false;
    this.supports = {};
    this.aliases = {
      'TensorFlow': 'python-tensorflow',
      'Lablup ResearchEnv.': 'python-ff',
      'Python': 'python',
      'PyTorch': 'python-pytorch',
      'Chainer': 'chainer',
      'R': 'r',
      'Julia': 'julia',
      'Lua': 'lua',
    };
    this.versions = [];
    this.languages = [];
    this.defaultLanguage = '';

    this.pipelineConfig = {
      title: '',
      description: '',
      environment: '',
      version: '',
      scaling_group: '',
      folder_host: '',
    }
    // this.pipelineSortable = {};
  }

  static get styles() {
    return [
      BackendAiStyles,
      IronFlex,
      IronFlexAlignment,
      IronFlexFactors,
      IronPositioning,
      // language=CSS
      css`
        wl-card h4 {
          padding: 5px 20px;
          border-bottom: 1px solid #dddddd;
          font-weight: 100;
        }

        wl-card h3.tab {
          padding-top: 0;
          padding-bottom: 0;
          padding-left: 0;
        }

        .indicator {
          font-family: monospace;
        }

        wl-button.button {
          --button-bg: var(--paper-blue-50);
          --button-bg-hover: var(--paper-blue-100);
          --button-bg-active: var(--paper-blue-600);
        }

        wl-button.launch-button {
          width: 335px;
          --button-bg: var(--paper-blue-50);
          --button-bg-hover: var(--paper-blue-100);
          --button-bg-active: var(--paper-blue-600);
        }

        #exp-sidebar {
          weight: 300px;
          border-right: 1px solid #ccc;
          height: calc(100vh - 235px);
        }

        .pipeline-item,
        .sidebar-item {
          width: 400px;
        }

        #pipeline-create-dialog {
          --dialog-min-width: 400px;
          --dialog-max-width: 600px;
          --dialog-min-height: 600px;
          --dialog-max-height: 700px;
        }

        #codemirror-dialog {
          --dialog-min-width: calc(100vw - 200px);
          --dialog-max-width: calc(100vw - 200px);
          --dialog-min-height: calc(100vh - 100px);
          --dialog-max-height: calc(100vh - 100px);
        }

        #codemirror-dialog wl-button {
          margin-left: 5px;
        }
      `];
  }

  firstUpdated() {
    fetch('resources/image_metadata.json').then(
      response => response.json()
    ).then(
      json => {
        this.aliases = json.aliases;
        this.tags = json.tags;
        this.humanizedNames = json.humanizedNames;
      }
    );
    this.shadowRoot.querySelector('#pipeline-environment').addEventListener('selected-item-label-changed', this.updateLanguage.bind(this));
    this._refreshImageList();

    this.notification = window.lablupNotification;
    this.indicator = this.shadowRoot.querySelector('#loading-indicator');
  }

  async _viewStateChanged(active) {
    await this.updateComplete;
    if (active === false) {
      return;
    }
    if (typeof window.backendaiclient === "undefined" || window.backendaiclient === null || window.backendaiclient.ready === false) {
      document.addEventListener('backend-ai-connected', () => {
        this._initPipelinePage();
        this._fetchPipelineFolders();
        this._makeSortablePipelineComponents();
      }, true);
    } else {
      this._initPipelinePage();
      this._fetchPipelineFolders();
      this._makeSortablePipelineComponents();
    }
  }

  _showTab(tab) {
    var els = this.shadowRoot.querySelectorAll(".tab-content");
    for (var x = 0; x < els.length; x++) {
      els[x].style.display = 'none';
    }
    this.shadowRoot.querySelector('#' + tab.value).style.display = 'block';
  }

  _initPipelinePage() {
    this.pipelineFolderName = '';
    this.pipelineConfig = {};
    this.pipelineComponents = [];
  }

  async _fetchPipelineFolders() {
    this.indicator.show();
    try {
      const folders = await window.backendaiclient.vfolder.list();
      const pipelines: Array<object> = [];
      const downloadJobs: Array<object> = [];
      folders.forEach((folder) => {
        if (folder.name.startsWith('pipeline-')) {
          const job = this._downloadPipelineConfig(folder.name)
              .then((resp) => {
                folder.config = resp;
                pipelines.push(folder);
              })
              .catch((err) => {
                if (err && err.message) {
                  this.notification.text = PainKiller.relieve(err.title);
                  this.notification.detail = err.message;
                  this.notification.show(true);
                }
              });
          downloadJobs.push(job);
        }
      });
      Promise.all(downloadJobs)
          .then(() => {
            this.pipelineFolderList = pipelines;
            this.indicator.hide();
          })
          .catch((err) => {
            if (err && err.message) {
              this.notification.text = PainKiller.relieve(err.title);
              this.notification.detail = err.message;
              this.notification.show(true);
            }
            this.indicator.hide();
          });
    } catch (err) {
      this.notification.text = PainKiller.relieve(err.title);
      this.notification.detail = err.message;
      this.notification.show(true);
      this.indicator.hide();
    }
  }

  updateLanguage() {
    let selectedItem = this.shadowRoot.querySelector('#pipeline-environment').selectedItem;
    if (selectedItem === null) return;
    let kernel = selectedItem.id;
    this._updateVersions(kernel);
  }

  _updateVersions(kernel) {
    if (kernel in this.supports) {
      this.versions = this.supports[kernel];
      this.versions.sort();
      this.versions.reverse(); // New version comes first.
    }
    if (this.versions !== undefined) {
      this.shadowRoot.querySelector('#pipeline-environment-tag').value = this.versions[0];
      // this.updateMetric('update versions');
    }
  }

  _refreshImageList() {
    const fields = [
      'name', 'humanized_name', 'tag', 'registry', 'digest', 'installed',
      'resource_limits { key min max }'
    ];
    window.backendaiclient.image.list(fields, true).then((response) => {
      const images: Array<object> = [];
      Object.keys(response.images).map((objectKey, index) => {
        const item = response.images[objectKey];
        if (item.installed === true) {
          images.push(item);
        }
      });
      if (images.length === 0) {
        return;
      }
      this.images = images;
      this.supports = {};
      Object.keys(this.images).map((objectKey, index) => {
        const item = this.images[objectKey];
        const supportsKey = `${item.registry}/${item.name}`;
        if (!(supportsKey in this.supports)) {
          this.supports[supportsKey] = [];
        }
        this.supports[supportsKey].push(item.tag);
        this.resourceLimits[`${supportsKey}:${item.tag}`] = item.resource_limits;
      });
      this._updateEnvironment();
    }).catch((err) => {
      // this.metadata_updating = false;
      if (err && err.message) {
        this.notification.text = PainKiller.relieve(err.title);
        this.notification.detail = err.message;
        this.notification.show(true);
      }
    });
  }

  async _fetchResourceGroup() {
    const currentGroup = window.backendaiclient.current_group || null;
    let sgs = await window.backendaiclient.scalingGroup.list(currentGroup);
    this.scalingGroups = sgs.scaling_groups;
    this.scalingGroup = sgs.scaling_groups[0].name;
  }

  _updateEnvironment() {
    // this.languages = Object.keys(this.supports);
    // this.languages.sort();
    const langs = Object.keys(this.supports);
    if (langs === undefined) return;
    langs.sort();
    this.languages = [];
    langs.forEach((item, index) => {
      if (!(Object.keys(this.aliases).includes(item))) {
        const humanizedName = this._guessHumanizedNames(item);
        if (humanizedName !== null) {
          this.aliases[item] = humanizedName;
        } else {
          this.aliases[item] = item;
        }
      }
      let specs = item.split('/');
      let registry = specs[0];
      let prefix, kernelName;
      if (specs.length == 2) {
        prefix = '';
        kernelName = specs[1];
      } else {
        prefix = specs[1];
        kernelName = specs[2];
      }
      const alias = this.aliases[item];
      let basename;
      if (alias !== undefined) {
        basename = alias.split(' (')[0];
      } else {
        basename = kernelName;
      }
      let tags: string[] = [];
      if (alias in this.tags) {
        tags = tags.concat(this.tags[alias]);
      }
      if (prefix != '') {
        tags.push(prefix);
      }
      this.languages.push({
        name: item,
        registry: registry,
        prefix: prefix,
        kernelname: kernelName,
        alias: alias,
        basename: basename,
        tags: tags
      });
    });
    this._initAliases();
  }

  _guessHumanizedNames(kernelName) {
    const candidate = this.humanizedNames;
    let imageName = '';
    let humanizedName = null;
    let matchedString = 'abcdefghijklmnopqrstuvwxyz1234567890!@#$%^&*()';
    Object.keys(candidate).forEach((item, index) => {
      let specs = kernelName.split('/');
      if (specs.length == 2) {
        imageName = specs[1];
      } else {
        imageName = specs[2];
      }
      if (imageName === item) {
        humanizedName = candidate[item];
        matchedString = item;
      } else if (imageName === '' && kernelName.endsWith(item) && item.length < matchedString.length) {
        humanizedName = candidate[item];
        matchedString = item;
      }
    });
    return humanizedName;
  }

  selectDefaultLanguage() {
    if (typeof window.backendaiclient === "undefined" || window.backendaiclient === null || window.backendaiclient.ready === false) {
      document.addEventListener('backend-ai-connected', () => {
        this._selectDefaultLanguage();
      }, true);
    } else {
      this._selectDefaultLanguage();
    }
  }

  _selectDefaultLanguage() {
    if (window.backendaiclient._config.default_session_environment !== undefined &&
      'default_session_environment' in window.backendaiclient._config &&
      window.backendaiclient._config.default_session_environment !== '') {
      this.defaultLanguage = window.backendaiclient._config.default_session_environment;
    } else if (this.languages.length !== 0) {
      this.defaultLanguage = this.languages[0].name;
    } else {
      this.defaultLanguage = 'index.docker.io/lablup/ngc-tensorflow';
    }
    return true;
  }


  _initAliases() {
    for (let item in this.aliases) {
      this.aliases[this.aliases[item]] = item;
    }
  }

  _selectPipeline(e) {
    let itemEl;
    if (typeof e === 'string') {
      itemEl = this.shadowRoot.querySelector(`.pipeline-item[folder-name="${e}"]`)
    } else {
      itemEl = e.target.closest('.pipeline-item');
    }
    this.pipelineFolderName = itemEl.getAttribute('folder-name');
    this._downloadPipelineConfig(this.pipelineFolderName)
        .then((resp) => {
          this.pipelineConfig = resp;
        })
        .catch((err) => {
          if (err && err.message) {
            this.notification.text = PainKiller.relieve(err.title);
            this.notification.detail = err.message;
            this.notification.show(true);
          }
        });
    this._downloadPipelineComponents(this.pipelineFolderName)
        .then((resp) => {
          this.pipelineComponents = resp;
        })
        .catch((err) => {
          if (err && err.message) {
            this.notification.text = PainKiller.relieve(err.title);
            this.notification.detail = err.message;
            this.notification.show(true);
          }
        });
    itemEl.active = true;
  }

  _openPipelineCreateDialog() {
    this.selectDefaultLanguage();
    this._fetchResourceGroup();
    this._fillPipelineCreateDialogFields(null);
    this.pipelineCreateMode = 'create';
    window.backendaiclient.vfolder.list_hosts()
        .then((resp) => {
          const listbox = this.shadowRoot.querySelector('#pipeline-folder-host paper-listbox');
          this.vhosts = resp.allowed.slice();
          this.vhost = resp.default;
          listbox.selected = this.vhost;
        })
        .catch((err) => {
          if (err && err.message) {
            this.notification.text = PainKiller.relieve(err.title);
            this.notification.detail = err.message;
            this.notification.show(true);
          }
        });
    this.shadowRoot.querySelector('#pipeline-create-dialog').show();
  }

  _hidePipelineCreateDialog() {
    const dialog = this.shadowRoot.querySelector('#pipeline-create-dialog');
    dialog.hide();
  }

  async _createPipeline() {
    const title = this.shadowRoot.querySelector('#pipeline-title').value;
    const description = this.shadowRoot.querySelector('#pipeline-description').value;
    const environment = this.shadowRoot.querySelector('#pipeline-environment').selectedItem.id;
    const version = this.shadowRoot.querySelector('#pipeline-environment-tag').value;
    const scaling_group = this.shadowRoot.querySelector('#pipeline-scaling-group').value;
    const folder_host = this.shadowRoot.querySelector('#pipeline-folder-host').value;
    const slugged_title = `pipeline-${window.backendaiclient.slugify(title)}-${window.backendaiclient.generateSessionId(8, true)}`;
    if (!title || !environment || !version || !scaling_group || !folder_host) {
      this.notification.text = 'Fill all input fields';
      this.notification.show();
      return;
    }
    const configObj = {
      title, description, environment, version, scaling_group, folder_host
    }
    this.indicator.show();
    if (this.pipelineCreateMode === 'create') {
      try {
        await window.backendaiclient.vfolder.create(slugged_title,folder_host);
        const uploadPipelineTask = this._uploadPipelineConfig(slugged_title, configObj);
        const uploadComponentsTask = this._uploadPipelineComponents(slugged_title, []);
        const fetchFoldersTask = this._fetchPipelineFolders();
        await Promise.all([uploadPipelineTask, uploadComponentsTask, fetchFoldersTask]);
        this._hidePipelineCreateDialog();
        this.indicator.hide();
        this.notification.text = 'Pipeline created';
        this.notification.show();
      } catch (err) {
        if (err && err.message) {
          this.notification.text = PainKiller.relieve(err.title);
          this.notification.detail = err.message;
          this.notification.show(true);
        }
        this.indicator.hide();
      }
    } else {
      try {
        await this._uploadPipelineConfig(this.pipelineFolderName, configObj);
        await this._fetchPipelineFolders();
        this._hidePipelineCreateDialog();
        this._selectPipeline(this.pipelineFolderName);
        this.indicator.hide();
      } catch (err) {
        if (err && err.message) {
          this.notification.text = PainKiller.relieve(err.title);
          this.notification.detail = err.message;
          this.notification.show(true);
        }
        this.indicator.hide();
      }
    }
  }

  async _openPipelineUpdateDialog() {
    if (!this.pipelineFolderName) {
      this.notification.text = 'No pipeline selected';
      this.notification.show();
      return;
    }
    this._fetchResourceGroup();
    const config = await this._downloadPipelineConfig(this.pipelineFolderName);
    this.pipelineCreateMode = 'update';
    window.backendaiclient.vfolder.list_hosts()
        .then((resp) => {
          const listbox = this.shadowRoot.querySelector('#pipeline-folder-host paper-listbox');
          this.vhosts = resp.allowed.slice();
          this.vhost = config.folder_host;
          listbox.selected = this.vhost;
        })
        .catch((err) => {
          if (err && err.message) {
            this.notification.text = PainKiller.relieve(err.title);
            this.notification.detail = err.message;
            this.notification.show(true);
          }
        });
    this._fillPipelineCreateDialogFields(config);
    this.shadowRoot.querySelector('#pipeline-create-dialog').show();
  }

  _fillPipelineCreateDialogFields(config) {
    if (!config) config = {};
    const dialog = this.shadowRoot.querySelector('#pipeline-create-dialog');
    dialog.querySelector('#pipeline-title').value = config.title || '';
    dialog.querySelector('#pipeline-description').value = config.description || '';
    if (config.environment) dialog.querySelector('#pipeline-environment paper-listbox').selected = config.environment;
    if (config.version) dialog.querySelector('#pipeline-environment-tag').value = config.version;
    if (config.scaling_group) dialog.querySelector('#pipeline-scaling-group').value = config.scaling_group;
    if (config.folder_host) dialog.querySelector('#pipeline-folder-host').value = config.folder_host;
  }

  async _uploadPipelineConfig(folder_name, configObj) {
    const vfpath = 'config.json';
    const blob = new Blob([JSON.stringify(configObj, null, 2)], {type: 'application/json'});
    window.backendaiclient.vfolder.upload(vfpath, blob, folder_name)
        .then((resp) => {
        })
        .catch((err) => {
            this.notification.text = PainKiller.relieve(err.title);
            this.notification.detail = err.message;
            this.notification.show(true);
        });
  }

  async _downloadPipelineConfig(folder_name) {
    const vfpath = 'config.json';
    try {
      const configBlob = await window.backendaiclient.vfolder.download(vfpath, folder_name);
      const config = JSON.parse(await configBlob.text());
      return config;
    } catch (err) {
      this.notification.text = PainKiller.relieve(err.title);
      this.notification.detail = err.message;
      this.notification.show(true);
    }
  }

  _openComponentAddDialog() {
    if (!this.pipelineFolderName) {
      this.notification.text = 'No pipeline selected';
      this.notification.show();
      return;
    }
    this.componentCreateMode = 'create';
    this._fillComponentAddDialogFields(null);
    this.shadowRoot.querySelector('#component-add-dialog').show();
  }

  _hideComponentAddDialog() {
    this.shadowRoot.querySelector('#component-add-dialog').hide();
  }

  async _addComponent() {
    const title = this.shadowRoot.querySelector('#component-title').value;
    const description = this.shadowRoot.querySelector('#component-description').value;
    const path = this.shadowRoot.querySelector('#component-path').value;
    if (!title || !path) {
      this.notification.text = 'Title and path are required';
      this.notification.show();
      return;
    }
    const sluggedPath = window.backendaiclient.slugify(path);
    let cpu = this.shadowRoot.querySelector('#component-cpu').value;
    let mem = this.shadowRoot.querySelector('#component-mem').value;
    let gpu = this.shadowRoot.querySelector('#component-gpu').value;
    if (cpu < 1) {
      this.notification.text = 'CPU should be at least 1';
      this.notification.show();
      return;
    }
    if (mem < 0.1) {
      this.notification.text = 'Memory should be at least 0.1 GiB';
      this.notification.show();
      return;
    }
    if (!gpu) gpu = 0;

    const cinfo = {
      title, description, path: sluggedPath,
      cpu, mem, gpu,
      executed: false
    };
    if (this.componentCreateMode === 'create') {
      this.pipelineComponents.push(cinfo);
    } else {
      if (this.selectedComponentIndex < 0) {
        this.notification.text = 'Invalid component';
        this.notification.show();
        return;
      }
      this.pipelineComponents[this.selectedComponentIndex] = cinfo;
      this.selectedComponentIndex = -1;
    }
    this.indicator.show();
    await this._uploadPipelineComponents(this.pipelineFolderName, this.pipelineComponents);
    this.pipelineComponents = this.pipelineComponents.slice();
    this._hideComponentAddDialog();
    this.indicator.hide();
  }

  _openComponentUpdateDialog(info, idx) {
    this.componentCreateMode = 'update';
    this.selectedComponentIndex = idx;
    this._fillComponentAddDialogFields(info);
    this.shadowRoot.querySelector('#component-add-dialog').show();
  }

  _openComponentDeleteDialog(idx) {
    this.selectedComponentIndex = idx;
    this.shadowRoot.querySelector('#component-delete-dialog').show();
  }

  _hideComponentDeleteDialog() {
    this.shadowRoot.querySelector('#component-delete-dialog').hide();
  }

  _deleteComponent() {
    if (this.selectedComponentIndex < 0) {
      this.notification.text = 'Invalid component';
      this.notification.show();
      return;
    }
    this.pipelineComponents.splice(this.selectedComponentIndex, 1);
    this._uploadPipelineComponents(this.pipelineFolderName, this.pipelineComponents);
    this.pipelineComponents = this.pipelineComponents.slice();
    this.shadowRoot.querySelector('#component-delete-dialog').hide();
  }

  _fillComponentAddDialogFields(info) {
    if (!info) info = {};
    const dialog = this.shadowRoot.querySelector('#component-add-dialog');
    dialog.querySelector('#component-title').value = info.title || '';
    dialog.querySelector('#component-description').value = info.description || '';
    dialog.querySelector('#component-path').value = info.path || '';
    dialog.querySelector('#component-cpu').value = info.cpu || '1';
    dialog.querySelector('#component-mem').value = info.mem || '1';
    dialog.querySelector('#component-gpu').value = info.gpu || '0';
  }

  async _uploadPipelineComponents(folder_name, cinfo) {
    const vfpath = 'components.json';
    const blob = new Blob([JSON.stringify(cinfo, null, 2)], {type: 'application/json'});
    window.backendaiclient.vfolder.upload(vfpath, blob, folder_name)
        .then((resp) => {
        })
        .catch((err) => {
            this.notification.text = PainKiller.relieve(err.title);
            this.notification.detail = err.message;
            this.notification.show(true);
        });
  }

  async _downloadPipelineComponents(folder_name) {
    const vfpath = 'components.json';
    try {
      const configBlob = await window.backendaiclient.vfolder.download(vfpath, folder_name);
      const config = JSON.parse(await configBlob.text());
      return config;
    } catch (err) {
      this.notification.text = PainKiller.relieve(err.title);
      this.notification.detail = err.message;
      this.notification.show(true);
    }
  }

  _makeSortablePipelineComponents() {
    const el = this.shadowRoot.querySelector('#pipeline-component-list');
    // this.pipelineSortable = Sortable.create(el);
    Sortable.create(el);
  }

  async _ensureComponentFolder(component) {
    const folder = `${component.path}`;
    try {
      await window.backendaiclient.vfolder.mkdir(folder, this.pipelineFolderName);
    } catch (err) {
      this.notification.text = PainKiller.relieve(err.title);
      this.notification.detail = err.message;
      this.notification.show(true);
    }
  }

  async _ensureComponentMainCode(component) {
    await this._ensureComponentFolder(component);
    const filepath = `${component.path}/main.py`; // TODO: hard-coded file name
    try {
      const blob = await window.backendaiclient.vfolder.download(filepath, this.pipelineFolderName);
      return await blob.text();
    } catch (err) {
      if (err.title && err.title.split(' ')[0] === '404') {
        // Code file not found. upload empty code.
        const blob = new Blob([''], {type: 'plain/text'});
        await window.backendaiclient.vfolder.upload(filepath, blob, this.pipelineFolderName);
        return '';
      } else {
        this.notification.text = PainKiller.relieve(err.title);
        this.notification.detail = err.message;
        this.notification.show(true);
      }
    }
  }

  async _editCode(idx) {
    if (idx < 0) {
      this.notification.text = 'Invalid component';
      this.notification.show();
      return;
    }
    this.indicator.show();
    this.selectedComponentIndex = idx;
    const component = this.pipelineComponents[idx];
    const code = await this._ensureComponentMainCode(component);
    const dialog = this.shadowRoot.querySelector('#codemirror-dialog');
    const editor = this.shadowRoot.querySelector('#codemirror-editor');
    editor.setValue(code);
    dialog.querySelector('div[slot="header"]').textContent = component.title;
    dialog.show();
    this.indicator.hide();
  }

  async _saveCode() {
    if (this.selectedComponentIndex < 0) {
      this.notification.text = 'Invalid component';
      this.notification.show();
      return;
    }
    this.indicator.show();
    const component = this.pipelineComponents[this.selectedComponentIndex];
    const filepath = `${component.path}/main.py`; // TODO: hard-coded file name
    const editor = this.shadowRoot.querySelector('#codemirror-editor');
    const code = editor.getValue();
    const blob = new Blob([code], {type: 'plain/text'});
    await window.backendaiclient.vfolder.upload(filepath, blob, this.pipelineFolderName);
    this.pipelineComponents[this.selectedComponentIndex].executed = false;
    this.pipelineComponents = this.pipelineComponents.slice();
    this.indicator.hide();
  }

  _hideCodeDialog() {
    this.selectedComponentIndex = -1;
    const codemirrorEl = this.shadowRoot.querySelector('#codemirror-dialog');
    codemirrorEl.hide();
  }

  async _saveCodeAndCloseDialog() {
    await this._saveCode();
    this._hideCodeDialog();
  }

  async _runComponentCode(idx) {
    if (idx < 0) {
      this.notification.text = 'Invalid component';
      this.notification.show();
      return;
    }
    for (let i = 0; i < idx; i++) {
      const comp = this.pipelineComponents[i];
      if (!comp.executed) {
        this.notification.text = 'Run previous component(s) first';
        this.notification.show();
        return;
      }
    }
    this.indicator.show();
    const pipeline = this.pipelineConfig;
    const component = this.pipelineComponents[idx];
    const image = `${pipeline.environment}:${pipeline.version}`;
    let opts = {
      domain: window.backendaiclient._config.domainName,
      group_name: window.backendaiclient.current_group,
      maxWaitSeconds: 5,
      mounts: [this.pipelineFolderName],
      scaling_group: component.scaling_group,
      cpu: component.cpu,
      mem: component.mem + 'g', // memeory in GiB
      fgpu: component.gpu,
    }
    let code = await this._ensureComponentMainCode(component);
    let mode = 'query';
    let runId = null;
    try {
      const kernel = await window.backendaiclient.createKernel(image, undefined, opts);
      console.log('---kernel creation')
      console.log(kernel)
      console.log('---execution')
      while (true) {
        const result = await window.backendaiclient.execute(
          kernel.kernelId,
          runId,
          mode,
          code,
          opts,
        );
        console.log(result)
        runId = result.result.runId;
        opts = result.result.opts;
        const output = result.result.console || [];
        for (let i = 0; i < output.length; i++) {
          if (output[0] === 'stdout') {
            console.log(output[1]);
          } else if (output[0] === 'stderr') {
            console.error(output[1]);
          }
        }
        if (result.result.status === 'finished') {
          break;
        } else {
          mode = 'continue';
          code = '';
        }
      }
      const logs = await window.backendaiclient.getLogs(kernel.kernelId);
      console.log('---logs')
      console.log(logs)
      const filepath = `${component.path}/logs.txt`;
      const blob = new Blob([logs.result.logs], {type: 'plain/text'});
      await window.backendaiclient.vfolder.upload(filepath, blob, this.pipelineFolderName);
      await window.backendaiclient.destroy(kernel.kernelId);

      component.executed = true;
      this.pipelineComponents[idx] = component;
      await this._uploadPipelineComponents(this.pipelineFolderName, this.pipelineComponents);
      this.pipelineComponents = this.pipelineComponents.slice();
      this.notification.text = `Pipeline component ${idx + 1} executed`;
      this.notification.show();
    } catch (err) {
      this.notification.text = PainKiller.relieve(err.title);
      this.notification.detail = err.message;
      this.notification.show(true);
    }
    this.indicator.hide();
  }

  async _runPipeline() {
    for (let i = 0; i < this.pipelineComponents.length; i++) {
      console.log('- pipeline' + i)
      await this._runComponentCode(i);
    }
    this.notification.text = 'Executed all pipeline components';
    this.notification.show();
  }

  render() {
    // language=HTML
    return html`
      <wl-card class="item" elevation="1">
        <h3 class="tab horizontal center layout">
          <wl-tab-group>
            <wl-tab value="exp-lists" checked @click="${(e) => this._showTab(e.target)}">List</wl-tab>
            <wl-tab value="running-lists" @click="${(e) => this._showTab(e.target)}">Running</wl-tab>
            <wl-tab value="finished-lists" @click="${(e) => this._showTab(e.target)}">Finished</wl-tab>
          </wl-tab-group>
          <span class="flex"></span>
          <wl-button class="fg blue button" id="edit-pipeline" outlined
              @click="${this._openPipelineUpdateDialog}">
            <wl-icon>edit</wl-icon>
            Edit pipeline
          </wl-button>
          <span style="width:5px;"></span>
          <wl-button class="fg blue button" id="add-experiment" outlined
              @click="${this._openPipelineCreateDialog}">
            <wl-icon>add</wl-icon>
            Add pipeline
          </wl-button>
        </h3>
        <div id="exp-lists" class="tab-content" style="margin:0;padding:0;height:calc(100vh - 235px);">
          <div class="horizontal wrap layout" style="margin:0;padding:0;">
            <div id="exp-sidebar">
              <h4>Pipeline</h4>
              ${this.pipelineFolderList.map((item) => html`
                <wl-list-item class="pipeline-item" @click=${this._selectPipeline}
                    ?active="${item.name === this.pipelineFolderName}"
                    folder-id="${item.id}" folder-name="${item.name}" folder-host="${item.host}">
                  <iron-icon icon="vaadin:flask" slot="before"></iron-icon>
                  <wl-title level="4" style="margin: 0">${item.config.title}</wl-title>
                  <span style="font-size: 11px;">${item.config.description}</span>
                </wl-list-item>
              `)}
              ${this.pipelineFolderList.length < 1 ? html`<wl-list-item>No pipeline.</wl-list-item>` : ''}
              <h4>Templates</h4>
              <wl-list-item class="sidebar-item" disabled>
                <iron-icon icon="vaadin:flask" slot="before"></iron-icon>
                  <span slot="after">5<br/><span style="font-size:9px">components</span></span>
                  <wl-title level="4" style="margin: 0">Example Experiment (TensorFlow)</wl-title>
                  <span style="font-size: 11px;">Basic experiment example using TensorFlow</span>
              </wl-list-item>
              <wl-list-item class="sidebar-item" disabled>
                <iron-icon icon="vaadin:flask" slot="before"></iron-icon>
                  <span slot="after">4<br/><span style="font-size:9px">components</span></span>
                  <wl-title level="4" style="margin: 0">Example Experiment (PyTorch)</wl-title>
                  <span style="font-size: 11px;">Basic experiment example using Pytorch</span>
              </wl-list-item>
              <wl-list-item class="sidebar-item" disabled>
                <iron-icon icon="vaadin:flask" slot="before"></iron-icon>
                  <span slot="after">4<br/><span style="font-size:9px">components</span></span>
                  <wl-title level="4" style="margin: 0">Facet data cleaner</wl-title>
                  <span style="font-size: 11px;">Data preprocessing using Facet</span>
              </wl-list-item>
            </div>
            <div class="layout vertical flex">
              <div class="layout horizontal" style="padding:5px 20px">
                <div class="layout vertical flex">
                  ${this.pipelineConfig.environment && this.pipelineConfig.version ? html`
                    <span>Environment: ${this.pipelineConfig.environment}:${this.pipelineConfig.version}</span>
                  ` : ''}
                  ${this.pipelineConfig.scaling_group ? html`
                    <span>Scaling group: ${this.pipelineConfig.scaling_group}</span>
                  ` : ''}
                  ${this.pipelineConfig.folder_host ? html`
                    <span>Folder: ${this.pipelineFolderName} (${this.pipelineConfig.folder_host})</span>
                  ` : ''}
                </div>
                <div class="layout horizontal center">
                  <wl-button class="fg blue button" id="add-component" outlined
                      @click="${this._openComponentAddDialog}">
                    <wl-icon>add</wl-icon>
                    Add component
                  </wl-button>
                </div>
              </div>
              <div id="pipeline-component-list">
                ${this.pipelineComponents.map((item, idx) => html`
                  <wl-list-item style="width:calc(100%-55px); height:80px">
                    <iron-icon icon="vaadin:puzzle-piece" slot="before"></iron-icon>
                    <div slot="after">
                      <div class="horizontal layout">
                        <div class="layout horizontal center" style="width:150px;">
                            <paper-icon-button class="fg black" icon="vaadin:code" @click="${() => this._editCode(idx)}"></paper-icon-button>
                            <paper-icon-button class="fg ${item.executed ? 'green' : 'black'}" icon="vaadin:play" @click="${() => this._runComponentCode(idx)}"></paper-icon-button>
                            <paper-icon-button class="fg black" icon="vaadin:edit" @click="${() => this._openComponentUpdateDialog(item, idx)}"></paper-icon-button>
                            <paper-icon-button class="fg black" icon="vaadin:trash" @click="${() => this._openComponentDeleteDialog(idx)}"></paper-icon-button>
                        </div>
                        <div class="layout vertical start flex" style="width:80px!important;">
                          <div class="layout horizontal configuration">
                            <iron-icon class="fg blue" icon="hardware:developer-board"></iron-icon>
                            <span>${item.cpu}</span>
                            <span class="indicator">core</span>
                          </div>
                          <div class="layout horizontal configuration">
                            <iron-icon class="fg blue" icon="hardware:memory"></iron-icon>
                            <span>${item.mem}</span>
                            <span class="indicator">GB</span>
                          </div>
                          <div class="layout horizontal configuration">
                            <iron-icon class="fg blue" icon="icons:view-module"></iron-icon>
                            <span>${item.gpu}</span>
                            <span class="indicator">GPU</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <wl-title level="4" style="margin: 0">${item.title}</wl-title>
                    <div style="font-size:11px;max-width:400px;">${item.description}</div>
                    <div style="font-size:11px;max-width:400px;">${item.path}</div>
                  </wl-list-item>
                `)}
                <div class="layout vertical">
                  ${this.pipelineComponents.length < 1 ? html`
                    <wl-list-item>No components.</wl-list-item>
                  ` : html`
                    <wl-button class="fg blue button" id="run-pipeline-button" outlined
                        @click="${this._runPipeline}" style="margin: 0 1em">
                      Run pipeline
                    </wl-button>
                  `}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div id="running-lists" class="tab-content" style="display:none;">
          <backend-ai-session-list id="running-jobs" condition="running" ?active="${this._status === 'active'}"></backend-ai-session-list>
        </div>
        <div id="finished-lists" class="tab-content" style="display:none;">
          <backend-ai-session-list id="finished-jobs" condition="finished" ?active="${this._status === 'active'}"></backend-ai-session-list>
        </div>
      </wl-card>

      <wl-dialog id="pipeline-create-dialog" fixed blockscrolling backdrop>
        <div slot="header">${this.pipelineCreateMode === 'create' ? 'Create' : 'Update'} pipeline config</div>
        <div slot="content">
          <wl-textfield id="pipeline-title" label="Pipeline title" maxLength="30"></wl-textfield>
          <wl-textfield id="pipeline-description" label="Pipeline description" maxLength="200"></wl-textfield>
          <div class="layout horizontal">
            <paper-dropdown-menu id="pipeline-environment" label="Environments" horizontal-align="left">
              <paper-listbox slot="dropdown-content" attr-for-selected="id"
                             selected="${this.defaultLanguage}">
                ${this.languages.map(item => html`
                  <paper-item id="${item.name}" label="${item.alias}">${item.basename}
                    ${item.tags ? item.tags.map(item => html`
                      <lablup-shields style="margin-left:5px;" description="${item}"></lablup-shields>
                    `) : ''}
                  </paper-item>
                `)}
              </paper-listbox>
            </paper-dropdown-menu>
            <paper-dropdown-menu id="pipeline-environment-tag" label="Version">
              <paper-listbox slot="dropdown-content" selected="0">
                ${this.versions.map(item => html`
                  <paper-item id="${item}" label="${item}">${item}</paper-item>
                `)}
              </paper-listbox>
            </paper-dropdown-menu>
          </div>
          <div class="layout horizontal">
            <paper-dropdown-menu id="pipeline-scaling-group" label="Resource Group" horizontal-align="left">
              <paper-listbox selected="${this.scalingGroup}" slot="dropdown-content" attr-for-selected="id">
                ${this.scalingGroups.map(item => html`
                  <paper-item id="${item.name}" label="${item.name}">${item.name}</paper-item>
                `)}
              </paper-listbox>
            </paper-dropdown-menu>
            <paper-dropdown-menu id="pipeline-folder-host" label="Folder host">
              <paper-listbox slot="dropdown-content" attr-for-selected='label'>
                ${this.vhosts.map(item => html`
                  <paper-item label="${item}">${item}</paper-item>
                `)}
              </paper-listbox>
            </paper-dropdown-menu>
          </div>
        </div>
        <div slot="footer">
          <wl-button inverted flat id="" @click="${this._hidePipelineCreateDialog}">Cancel</wl-button>
          <wl-button type="submit" id="create-pipeline-button" @click="${this._createPipeline}">
            ${this.pipelineCreateMode === 'create' ? 'Create' : 'Update'}
          </wl-button>
        </div>
      </wl-dialog>

      <wl-dialog id="component-add-dialog" fixed blockscrolling backdrop>
        <div slot="header">${this.componentCreateMode === 'create' ? 'Add' : 'Update'} component</div>
        <div slot="content">
          <wl-textfield id="component-title" label="Component title" maxLength="30"></wl-textfield>
          <wl-textfield id="component-description" label="Component description" maxLength="200"></wl-textfield>
          <wl-textfield id="component-path" label="Component path in folder"
              placeHolder="001-load-and-process-data" maxLength="300"></wl-textfield>
          <div class="layout horizontal">
            <wl-textfield id="component-cpu" label="CPU" type="number" value="1" min="1"></wl-textfield>
            <wl-textfield id="component-mem" label="Memory (GiB)" type="number" value="1" min="0"></wl-textfield>
            <wl-textfield id="component-gpu" label="GPU" type="number" value="0" min="0"></wl-textfield>
          </div>
        </div>
        <div slot="footer">
          <wl-button inverted flat id="" @click="${this._hideComponentAddDialog}">Cancel</wl-button>
          <wl-button type="submit" id="add-component-button" @click="${this._addComponent}">
            ${this.componentCreateMode === 'create' ? 'Add' : 'Update'}
          </wl-button>
        </div>
      </wl-dialog>

      <wl-dialog id="codemirror-dialog" fixed backdrop scrollable blockScrolling persistent>
        <div slot="header"></div>
        <div slot="content">
          <lablup-codemirror id="codemirror-editor"></lablup-codemirror>
        </div>
        <div slot="footer">
          <wl-button inverted flat id="discard-code" @click="${this._hideCodeDialog}">Close without save</wl-button>
          <wl-button id="save-code-and-close" @click="${this._saveCodeAndCloseDialog}">Save and close</wl-button>
          <wl-button id="save-code" @click="${this._saveCode}">Save</wl-button>
        </div>
      </wl-dialog>

      <wl-dialog id="component-delete-dialog" fixed backdrop blockscrolling>
         <wl-title level="3" slot="header">Delete component?</wl-title>
         <div slot="content">
            <p>This action cannot be undone. Do you want to proceed?</p>
         </div>
         <div slot="footer">
            <wl-button class="cancel" inverted flat @click="${this._hideComponentDeleteDialog}">
              Cancel</wl-button>
            <wl-button class="ok" @click="${this._deleteComponent}">Delete</wl-button>
         </div>
      </wl-dialog>

      <lablup-loading-indicator id="loading-indicator"></lablup-loading-indicator>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "backend-ai-pipeline-view": BackendAIPipelineView;
  }
}
