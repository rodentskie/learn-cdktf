import { Construct } from "constructs";
import { App, Fn, TerraformStack, S3Backend, TerraformOutput } from "cdktf";
import { KubernetesProvider } from "./.gen/providers/kubernetes";
import { AwsProvider, vpc, eks } from "./.gen/providers/aws";
import { Eks } from "./.gen/modules/terraform-aws-modules/aws/eks";

const map_users = [
  {
    userarn: "arn:aws:iam::663242346353:user/rodney_lingganay",
    username: "rodney_lingganay",
    groups: ["system:masters"],
  },
];

const disk_size = 25;

const on_demand_desired_capacity = 1;

const on_demand_min_capacity = 1;

const on_demand_max_capacity = 1;

const on_demand_instance_types = ["t3.medium"];

const spot_desired_capacity = 5;

const spot_min_capacity = 5;

const spot_max_capacity = 6;

const spot_instance_types = ["t3.medium"];

class EksStack extends TerraformStack {
  public eks: eks.DataAwsEksCluster;
  public eksAuth: eks.DataAwsEksClusterAuth;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    new AwsProvider(this, "AWS", {
      region: "ap-southeast-1",
    });

    const vpcData = new vpc.DataAwsVpc(this, "vpc", {
      tags: {
        Name: "rod-test-vpc-dev",
        Environment: "dev",
      },
    });

    const subnetIds = new vpc.DataAwsSubnetIds(this, "vpc_id", {
      vpcId: vpcData.id,
    });

    const eksModule = new Eks(this, "eks", {
      clusterName: "rod-test-eks-dev",
      clusterVersion: "1.21",
      manageAwsAuth: true,
      subnets: subnetIds.ids,
      vpcId: vpcData.id,
      clusterEndpointPrivateAccess: true,
      workersGroupDefaults: {
        rootVolumeType: "gp2",
      },
      nodeGroupsDefaults: {
        amiType: "AL2_x86_64",
        diskSize: disk_size,
      },
      nodeGroups: {
        ["on-demand"]: {
          desiredCapacity: on_demand_desired_capacity,
          minCapacity: on_demand_min_capacity,
          maxCapacity: on_demand_max_capacity,
          instanceTypes: on_demand_instance_types,
          capacityType: "ON_DEMAND",
        },
        spot: {
          desiredCapacity: spot_desired_capacity,
          minCapacity: spot_min_capacity,
          maxCapacity: spot_max_capacity,
          instanceTypes: spot_instance_types,
          capacityType: "SPOT",
        },
      },
      tags: {
        Terraform: "true",
        Project: "rod-test",
        Environment: "dev",
        ["k8s.io/cluster-autoscaler/enabled"]: "TRUE",
      },
      mapUsers: map_users,
    });

    this.eks = new eks.DataAwsEksCluster(this, "eks-cluster", {
      name: eksModule.clusterIdOutput,
    });
    this.eksAuth = new eks.DataAwsEksClusterAuth(this, "eks-auth", {
      name: eksModule.clusterIdOutput,
    });

    new TerraformOutput(this, "cluster_endpoint", {
      value: eksModule.clusterEndpointOutput,
    });

    new S3Backend(this, {
      bucket: "onewallet-cdktf-test",
      key: "cdktf/eks.json",
      region: "ap-southeast-1",
    });
  }
}

class KubernetesApplicationStack extends TerraformStack {
  constructor(
    scope: Construct,
    id: string,
    cluster: eks.DataAwsEksCluster,
    clusterAuth: eks.DataAwsEksClusterAuth
  ) {
    super(scope, id);

    new KubernetesProvider(this, "cluster", {
      host: cluster.endpoint,
      clusterCaCertificate: Fn.base64decode(
        cluster.certificateAuthority("0").data
      ),
      token: clusterAuth.token,
    });
  }
}

const app = new App();

const cluster = new EksStack(app, "eks");
new KubernetesApplicationStack(app, "k8", cluster.eks, cluster.eksAuth);

app.synth();
