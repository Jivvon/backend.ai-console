/**
 @license
 Copyright (c) 2015-2018 Lablup Inc. All rights reserved.
 */

import {css, html, LitElement} from "lit-element";
import {render} from 'lit-html';

import '@polymer/paper-icon-button/paper-icon-button';
import '@polymer/iron-icon/iron-icon';
import '@polymer/iron-icons/iron-icons';
import '@polymer/iron-icons/hardware-icons';
import '@polymer/iron-icons/av-icons';
import '@vaadin/vaadin-grid/vaadin-grid.js';
import '../plastics/lablup-shields/lablup-shields.js';
import '@vaadin/vaadin-progress-bar/vaadin-progress-bar.js';
import '@polymer/paper-progress/paper-progress';

import './lablup-notification.js';

import {BackendAiStyles} from "./backend-ai-console-styles";
import {IronFlex, IronFlexAlignment} from "../plastics/layout/iron-flex-layout-classes";


class BackendAIAgentList extends LitElement {
  constructor() {
    super();
    this.condition = 'running';
    this.active = false;
    this.agents = [];
    this._boundContactDateRenderer = this.contactDateRenderer.bind(this);
    this._boundStatusRenderer = this.statusRenderer.bind(this);
    this._boundControlRenderer = this.controlRenderer.bind(this);
  }

  static get is() {
    return 'backend-ai-agent-list';
  }

  static get properties() {
    return {
      condition: {
        type: String  // finished, running, archived
      },
      active: {
        type: Boolean
      },
      agents: {
        type: Array
      }
    };
  }

  static get styles() {
    return [
      BackendAiStyles,
      IronFlex,
      IronFlexAlignment,
      // language=CSS
      css`
        vaadin-grid {
          border: 0;
          font-size: 14px;
          height: calc(100vh - 250px);
        }

        paper-item {
          height: 30px;
          --paper-item-min-height: 30px;
        }

        iron-icon {
          width: 16px;
          height: 16px;
          min-width: 16px;

          min-height: 16px;
          padding: 0;
        }

        paper-icon-button {
          --paper-icon-button: {
            width: 25px;
            height: 25px;
            min-width: 25px;
            min-height: 25px;
            padding: 3px;
            margin-right: 5px;
          };
        }

        div.indicator,
        span.indicator {
          font-size: 9px;
          margin-right: 5px;
        }

        vaadin-progress-bar {
          width: 100px;
          height: 6px;
        }

        paper-progress {
          width: 100px;
          border-radius: 3px;
          --paper-progress-height: 10px;
          --paper-progress-active-color: #3677EB;
          --paper-progress-secondary-color: #98BE5A;
          --paper-progress-transition-duration: 0.08s;
          --paper-progress-transition-timing-function: ease;
          --paper-progress-transition-delay: 0s;
        }
      `];
  }

  firstUpdated() {
  }

  connectedCallback() {
    super.connectedCallback();
  }

  shouldUpdate() {
    return this.active;
  }

  attributeChangedCallback(name, oldval, newval) {
    if (name == 'active' && newval !== null) {
      this._menuChanged(true);
    } else {
      this._menuChanged(false);
    }
    super.attributeChangedCallback(name, oldval, newval);
  }

  async _menuChanged(active) {
    await this.updateComplete;
    if (active === false) {
      return;
    }
    // If disconnected
    if (window.backendaiclient === undefined || window.backendaiclient === null || window.backendaiclient.ready === false) {
      document.addEventListener('backend-ai-connected', () => {
        let status = 'ALIVE';
        this._loadAgentList(status);
      }, true);
    } else { // already connected
      let status = 'ALIVE';
      this._loadAgentList(status);
    }
  }

  _loadAgentList(status = 'running') {
    if (this.active !== true) {
      return;
    }

    switch (this.condition) {
      case 'running':
        status = 'ALIVE';
        break;
      case 'finished':
        status = 'TERMINATED';
        break;
      case 'archived':
      default:
        status = 'ALIVE';
    }
    let fields = ['id', 'status', 'addr', 'region', 'first_contact', 'cpu_cur_pct', 'mem_cur_bytes', 'available_slots', 'occupied_slots'];
    window.backendaiclient.agent.list(status, fields).then(response => {
      let agents = response.agents;
      if (agents !== undefined && agents.length != 0) {
        Object.keys(agents).map((objectKey, index) => {
          var agent = agents[objectKey];
          var occupied_slots = JSON.parse(agent.occupied_slots);
          var available_slots = JSON.parse(agent.available_slots);

          agents[objectKey].cpu_slots = parseInt(Number(available_slots.cpu));
          agents[objectKey].used_cpu_slots = parseInt(Number(occupied_slots.cpu));
          if (agent.cpu_cur_pct !== null) {
            agents[objectKey].current_cpu_percent = agent.cpu_cur_pct;
            agents[objectKey].cpu_total_usage_ratio = agents[objectKey].used_cpu_slots / agents[objectKey].cpu_slots * 100.0;
            agents[objectKey].cpu_current_usage_ratio = agents[objectKey].current_cpu_percent / agents[objectKey].cpu_slots;
            agents[objectKey].current_cpu_percent = agents[objectKey].current_cpu_percent.toFixed(2);
          } else {
            agents[objectKey].current_cpu_percent = 0;
            agents[objectKey].cpu_total_usage_ratio = 0;
            agents[objectKey].cpu_current_usage_ratio = 0;
          }
          if (agent.mem_cur_bytes !== null) {
            agents[objectKey].current_mem_bytes = agent.mem_cur_bytes;
          } else {
            agents[objectKey].current_mem_bytes = 0;
          }
          agents[objectKey].current_mem = window.backendaiclient.utils.changeBinaryUnit(agent.current_mem_bytes, 'g');
          agents[objectKey].mem_slots = parseInt(window.backendaiclient.utils.changeBinaryUnit(available_slots.mem, 'g'));
          agents[objectKey].used_mem_slots = parseInt(window.backendaiclient.utils.changeBinaryUnit(occupied_slots.mem, 'g'));
          agents[objectKey].mem_total_usage_ratio = agents[objectKey].used_mem_slots / agents[objectKey].mem_slots * 100.0;
          agents[objectKey].mem_current_usage_ratio = agents[objectKey].current_mem / agents[objectKey].mem_slots * 100.0;
          agents[objectKey].current_mem = agents[objectKey].current_mem.toFixed(2);
          if ('cuda.device' in available_slots) {
            agents[objectKey].gpu_slots = parseInt(Number(available_slots['cuda.device']));
          }
          if ('cuda.shares' in available_slots) {
            agents[objectKey].vgpu_slots = parseInt(available_slots['cuda.shares']);
          }
          if ('cuda.device' in occupied_slots) {
            agents[objectKey].used_gpu_slots = parseInt(Number(occupied_slots['cuda.device']));
          }
          if ('cuda.shares' in occupied_slots) {
            agents[objectKey].used_vgpu_slots = parseInt(occupied_slots['cuda.shares']);
          }
        });
      }
      this.agents = agents;
      if (this.active === true) {
        setTimeout(() => {
          this._loadAgentList(status)
        }, 15000);
      }
    }).catch(err => {
      if (err && err.message) {
        this.shadowRoot.querySelector('#notification').text = err.message;
        this.shadowRoot.querySelector('#notification').show();
      }
    });
  }

  _isRunning() {
    return this.condition === 'running';
  }

  _byteToMB(value) {
    return Math.floor(value / 1000000);
  }

  _MBtoGB(value) {
    return Math.floor(value / 1024);
  }

  _elapsed(start, end) {
    var startDate = new Date(start);
    if (this.condition === 'running') {
      var endDate = new Date();
    } else {
      var endDate = new Date(end);
    }
    var seconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000, -1);
    if (this.condition === 'running') {
      return 'Running ' + seconds + 'sec.';
    } else {
      return 'Reserved for ' + seconds + 'sec.';
    }
    return seconds;
  }

  _humanReadableDate(start) {
    var startDate = new Date(start);
    return startDate.toLocaleString('ko-KR');
  }

  _indexFrom1(index) {
    return index + 1;
  }

  _heartbeatStatus(state) {
    return state;
  }

  _heartbeatColor(state) {
    switch (state) {
      case 'ALIVE':
        return 'green';
      case 'TERMINATED':
        return 'red';
      default:
        return 'blue';
    }
  }

  _indexRenderer(root, column, rowData) {
    let idx = rowData.index + 1;
    render(
      html`
        <div>${idx}</div>
      `,
      root
    );
  }

  contactDateRenderer(root, column, rowData) {
    render(
      // language=HTML
      html`
        <div class="layout vertical">
            <span>${this._humanReadableDate(rowData.item.first_contact)}</span>
        </div>`, root
    );
  }

  statusRenderer(root, column, rowData) {
    render(
      // language=HTML
      html`
        <div class="layout horizontal justified wrap">
          <lablup-shields app="" color="${this._heartbeatColor(rowData.item.status)}"
                          description="${this._heartbeatStatus(rowData.item.status)}" ui="flat"></lablup-shields>
        </div>`, root
    );
  }

  controlRenderer(root, column, rowData) {
    render(
      // language=HTML
      html`
        <div id="controls" class="layout horizontal flex center" kernel-id="${rowData.item.sess_id}">
          <paper-icon-button disabled class="fg" icon="assignment"></paper-icon-button>
          ${this._isRunning() ? html`
            <paper-icon-button disabled class="fg controls-running" icon="build"></paper-icon-button>
            <paper-icon-button disabled class="fg controls-running" icon="alarm-add"></paper-icon-button>
            <paper-icon-button disabled class="fg controls-running" icon="av:pause"></paper-icon-button>
            <paper-icon-button disabled class="fg red controls-running" icon="delete"></paper-icon-button>          
          ` : html``}
    </div>`, root
    );
  }

  render() {
    // language=HTML
    return html`
      <lablup-notification id="notification"></lablup-notification>
      <vaadin-grid theme="row-stripes column-borders compact" aria-label="Job list" .items="${this.agents}">
        <vaadin-grid-column width="40px" flex-grow="0" header="#" .renderer="${this._indexRenderer}"></vaadin-grid-column>
        <vaadin-grid-column resizable>
          <template class="header">Endpoint</template>
          <template>
            <div class="indicator">[[item.addr]]</div>
            <div class="indicator">[[item.region]]</div>
          </template>
        </vaadin-grid-column>

        <vaadin-grid-column resizable .renderer="${this._boundContactDateRenderer}">
          <template class="header">Starts</template>
        </vaadin-grid-column>

        <vaadin-grid-column resizable>
          <template class="header">Resources</template>
          <template>
            <div class="layout flex">
              <div class="layout horizontal center flex">
                <iron-icon class="fg green" icon="hardware:developer-board"></iron-icon>
                <div class="layout vertical start" style="padding-left:5px;">
                  <div class="layout horizontal start">
                    <span>[[ item.cpu_slots ]]</span>
                    <span class="indicator">cores</span>
                  </div>
                  <div class="layout horizontal start">
                    <span>[[item.current_cpu_percent]]</span>
                    <span class="indicator">%</span>
                  </div>
                </div>
                <span class="flex"></span>
                <paper-progress id="cpu-usage-bar" value="[[item.cpu_current_usage_ratio]]"
                                secondary-progress="[[item.cpu_total_usage_ratio]]"></paper-progress>
              </div>
              <div class="layout horizontal center flex">
                <iron-icon class="fg green" icon="hardware:memory"></iron-icon>
                <div class="layout vertical start" style="padding-left:5px;">
                  <div class="layout horizontal start">
                    <span>[[item.mem_slots]]</span>
                    <span class="indicator">GB</span>
                  </div>
                  <div class="layout horizontal start">
                    <span>[[item.current_mem]]</span>
                    <span class="indicator">GB</span>
                  </div>
                </div>
                <span class="flex"></span>
                <paper-progress id="mem-usage-bar" value="[[item.mem_current_usage_ratio]]"
                                secondary-progress="[[item.mem_total_usage_ratio]]"></paper-progress>

              </div>
              <template is="dom-if" if="[[item.gpu_slots]]">
                <div class="layout horizontal center flex">
                  <iron-icon class="fg green" icon="icons:view-module"></iron-icon>
                  <span style="padding-left:5px;">[[item.gpu_slots]]</span>
                  <span class="indicator">GPU</span>
                  <span class="flex"></span>
                  <vaadin-progress-bar id="gpu-bar" value="[[item.used_gpu_slots]]"
                                       max="[[item.gpu_slots]]"></vaadin-progress-bar>
                </div>
              </template>
              <template is="dom-if" if="[[item.vgpu_slots]]">
                <div class="layout horizontal center flex">
                  <iron-icon class="fg green" icon="icons:view-module"></iron-icon>
                  <span style="padding-left:5px;">[[item.vgpu_slots]]</span>
                  <span class="indicator">vGPU</span>
                  <span class="flex"></span>
                  <vaadin-progress-bar id="vgpu-bar" value="[[item.used_vgpu_slots]]"
                                       max="[[item.vgpu_slots]]"></vaadin-progress-bar>
                </div>
              </template>
            </div>
          </template>
        </vaadin-grid-column>
        <vaadin-grid-column width="100px" flex-grow="0" resizable header="Status" .renderer="${this._boundStatusRenderer}"></vaadin-grid-column>
        <vaadin-grid-column resizable header="Control" .renderer="${this._boundControlRenderer}"></vaadin-grid-column>
      </vaadin-grid>
    `;
  }
}

customElements.define(BackendAIAgentList.is, BackendAIAgentList);