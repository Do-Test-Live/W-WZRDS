const AltarApp = {
    components: [],

    data() {
        return {
            web3Modal: null,
            web3Provider: null,
            web3: null,
            mintContract: null,
            shroomsContract: null,
            skullContract: null,
            fullSkullContract: null,
            skullMergeContract: null,

            connected: false,
            loading: true,
            successful: false,

            address: null,
            activeTab: null,
            totalOwnedShrooms: 0,
            totalHalfSkulls: 0,

            totalFullSkulls: {
                0: 0,
                1: 0,
                2: 0,
                3: 0,
                4: 0
            },

            mergeSelected1: null,
            mergeSelected2: null,
            mergeCompleted: false,

            cachedTokenMetadata: JSON.parse(window.localStorage.getItem('cachedTokenMetadata')) || {}
        };
    },

    async created() {
        await this.initializeWeb3();
    },

    methods: {
        async initializeWeb3() {
            this.web3Modal = new Web3Modal.default({
                cacheProvider: true,
                providerOptions: {
                    walletconnect: {
                        package: WalletConnectProvider.default,
                        options: {
                            rpc: {
                                1: 'https://cloudflare-eth.com/'
                            }
                        }
                    }
                }
            });

            this.loading = false;
        },

        async connectWallet() {
            try {
                this.web3Provider = await this.web3Modal.connect();
            } catch (err) {
                alert(`Connect failed: ${err.message || 'Canceled by user'}`);
                return;
            }

            this.web3 = new Web3(this.web3Provider);

            let chainId = await this.web3.eth.getChainId();

            if (chainId !== MintContract.chainId) {
                alert(`You're on the wrong network. Please swap to the Ethereum mainnet!`);
                return;
            }

            this.mintContract = new this.web3.eth.Contract(MintContract.abi, MintContract.address);
            this.shroomsContract = new this.web3.eth.Contract(ShroomsContract.abi, ShroomsContract.address);
            this.skullContract = new this.web3.eth.Contract(SkullContract.abi, SkullContract.address);
            this.fullSkullContract = new this.web3.eth.Contract(FullSkullContract.abi, FullSkullContract.address);
            this.skullMergeContract = new this.web3.eth.Contract(SkullMergeContract.abi, SkullMergeContract.address);

            let accounts = await this.web3.eth.requestAccounts();

            this.connected = true;
            this.address = accounts[0];

            await this.updateShroomsBalance();
            await this.updateSkullBalance();
        },

        async updateShroomsBalance() {
            this.loading = true;

            try {
                this.totalOwnedShrooms = parseInt(this.web3.utils.fromWei(await this.shroomsContract.methods.balanceOf(this.address).call()));
            } catch (err) {
                alert(`Update failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        async updateSkullBalance() {
            this.loading = true;

            try {
                this.totalHalfSkulls = parseInt(await this.skullContract.methods.balanceOf(this.address, 0).call());
                this.totalFullSkulls[0] = parseInt(await this.fullSkullContract.methods.balanceOf(this.address, 0).call());
                this.totalFullSkulls[1] = parseInt(await this.fullSkullContract.methods.balanceOf(this.address, 1).call());
                this.totalFullSkulls[2] = parseInt(await this.fullSkullContract.methods.balanceOf(this.address, 2).call());
                this.totalFullSkulls[3] = parseInt(await this.fullSkullContract.methods.balanceOf(this.address, 3).call());
                this.totalFullSkulls[4] = parseInt(await this.fullSkullContract.methods.balanceOf(this.address, 4).call());
            } catch (err) {
                alert(`Update failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        async changeTab(tabName) {
            await this.connectWallet();

            this.activeTab = tabName;
        },

        async exitTab() {
            this.activeTab = null;
            this.mergeCompleted = false;

            this.mergeSelected1 = null;
            this.mergeSelected2 = null;

            await this.selectMergeSkull(null);
        },

        async selectMergeSkull(i) {
            if (this.mergeSelected1 === i || this.mergeSelected2 === i) {
                return;
            }

            if (this.mergeSelected1 === null) {
                this.mergeSelected1 = i;
            } else if (this.mergeSelected2 === null) {
                this.mergeSelected2 = i;
            } else {
                this.mergeSelected1 = this.mergeSelected2;
                this.mergeSelected2 = i;
            }

            let skullEntries = document.querySelectorAll('.altar-half-skulls-grid .altar-skull-entry');

            for (let skullEntry of skullEntries) {
                skullEntry.classList.remove('is-selected');
            }

            if (this.mergeSelected1 !== null) {
                skullEntries[this.mergeSelected1].classList.add('is-selected');
            }

            if (this.mergeSelected2 !== null) {
                skullEntries[this.mergeSelected2].classList.add('is-selected');
            }
        },

        async mergeSkulls() {
            this.loading = true;

            try {
                let transaction = await this.skullMergeContract.methods.skullMerge().send({
                    from: this.address
                });

                await this.updateShroomsBalance();
                await this.updateSkullBalance();

                this.mergeSelected1 = null;
                this.mergeSelected2 = null;
                this.mergeCompleted = true;

                await this.selectMergeSkull(null);

                this.$forceUpdate();

                setTimeout(() => {
                    document.querySelector('.altar-merge-result video').play();

                    setTimeout(() => {
                        document.querySelector('.altar-merge-result video').classList.add('is-hidden');
                        document.querySelector('.altar-merge-result .result-image').classList.add('is-visible');
                    }, 3000);
                }, 0);
            } catch (err) {
                alert(`Merge failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        getTokenMetadata(tokenId) {
            if (!(tokenId in this.cachedTokenMetadata)) {
                this.cachedTokenMetadata[tokenId] = {
                    name: '...',
                    image: null,
                    loading: true
                };

                this.fetchTokenMetadata(tokenId);
            }

            return this.cachedTokenMetadata[tokenId];
        },

        async fetchTokenMetadata(tokenId) {
            let response = await axios.get(`/metadata/${tokenId}`);

            this.cachedTokenMetadata[tokenId] = response.data;

            window.localStorage.setItem('cachedTokenMetadata', JSON.stringify(this.cachedTokenMetadata));

            this.$forceUpdate();
        }
    }
};
