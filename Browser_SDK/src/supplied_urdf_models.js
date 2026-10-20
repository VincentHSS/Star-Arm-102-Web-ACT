// Supplied URDF geometry and kinematics; independent of hardware control mappings.
export const SUPPLIED_URDF_MODELS = {
  "fl-v3": {
    "key": "fl-v3",
    "name": "LumosTouch V3",
    "parts": [
      {
        "link": "base_link",
        "url": "../assets/urdf/fl-v3/meshes/base_link.STL",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.752941176470588,
          0.752941176470588,
          0.752941176470588
        ]
      },
      {
        "link": "link1",
        "url": "../assets/urdf/fl-v3/meshes/link1.STL",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.75294,
          0.75294,
          0.75294
        ]
      },
      {
        "link": "link2",
        "url": "../assets/urdf/fl-v3/meshes/link2.STL",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.75294,
          0.75294,
          0.75294
        ]
      },
      {
        "link": "link3",
        "url": "../assets/urdf/fl-v3/meshes/link3.STL",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.75294,
          0.75294,
          0.75294
        ]
      },
      {
        "link": "link4",
        "url": "../assets/urdf/fl-v3/meshes/link4.STL",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.75294,
          0.75294,
          0.75294
        ]
      },
      {
        "link": "link5",
        "url": "../assets/urdf/fl-v3/meshes/link5.STL",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.75294,
          0.75294,
          0.75294
        ]
      },
      {
        "link": "gripper_base",
        "url": "../assets/urdf/fl-v3/meshes/gripper_base.STL",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.75294,
          0.75294,
          0.75294
        ]
      },
      {
        "link": "gripper_link1",
        "url": "../assets/urdf/fl-v3/meshes/gripper_link1.STL",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.75294,
          0.75294,
          0.75294
        ]
      },
      {
        "link": "gripper_link2",
        "url": "../assets/urdf/fl-v3/meshes/gripper_link2.STL",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.75294,
          0.75294,
          0.75294
        ]
      }
    ],
    "joints": [
      {
        "name": "joint1",
        "type": "revolute",
        "parent": "base_link",
        "child": "link1",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          0.0,
          0.0,
          1.0
        ],
        "limit": {
          "lower": -2.824,
          "upper": 2.824
        },
        "clampToLimits": true,
        "displayAxisDirection": 1
      },
      {
        "name": "joint2",
        "type": "revolute",
        "parent": "link1",
        "child": "link2",
        "origin": {
          "xyz": [
            0.024,
            0.0,
            0.117
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          0.0,
          1.0,
          0.0
        ],
        "limit": {
          "lower": -0.209,
          "upper": 3.508
        },
        "clampToLimits": true,
        "displayAxisDirection": 1
      },
      {
        "name": "joint3",
        "type": "revolute",
        "parent": "link2",
        "child": "link3",
        "origin": {
          "xyz": [
            -0.265,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          0.0,
          1.0,
          0.0
        ],
        "limit": {
          "lower": -3.193,
          "upper": 0.0
        },
        "clampToLimits": true,
        "displayAxisDirection": 1
      },
      {
        "name": "joint4",
        "type": "revolute",
        "parent": "link3",
        "child": "link4",
        "origin": {
          "xyz": [
            0.265,
            0.0,
            0.062
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          0.0,
          1.0,
          0.0
        ],
        "limit": {
          "lower": -1.71,
          "upper": 1.71
        },
        "clampToLimits": true,
        "displayAxisDirection": 1
      },
      {
        "name": "joint5",
        "type": "revolute",
        "parent": "link4",
        "child": "link5",
        "origin": {
          "xyz": [
            0.078,
            0.0,
            -0.00295
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          0.0,
          0.0,
          1.0
        ],
        "limit": {
          "lower": -1.71,
          "upper": 1.71
        },
        "clampToLimits": true,
        "displayAxisDirection": 1
      },
      {
        "name": "joint6",
        "type": "revolute",
        "parent": "link5",
        "child": "gripper_base",
        "origin": {
          "xyz": [
            0.0255,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          1.0,
          0.0,
          0.0
        ],
        "limit": {
          "lower": -2.856,
          "upper": 2.856
        },
        "clampToLimits": true,
        "displayAxisDirection": 1
      },
      {
        "name": "gripper_joint1",
        "type": "prismatic",
        "parent": "gripper_base",
        "child": "gripper_link1",
        "origin": {
          "xyz": [
            0.15584,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          0.0,
          1.0,
          0.0
        ],
        "limit": {
          "lower": -0.0425,
          "upper": 0.0
        },
        "clampToLimits": true,
        "displayAxisDirection": 1
      },
      {
        "name": "gripper_joint2",
        "type": "prismatic",
        "parent": "gripper_base",
        "child": "gripper_link2",
        "origin": {
          "xyz": [
            0.15584,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          0.0,
          1.0,
          0.0
        ],
        "limit": {
          "lower": 0.0,
          "upper": 0.0425
        },
        "clampToLimits": true,
        "displayAxisDirection": 1
      }
    ],
    "sourceUrdf": "../assets/urdf/fl-v3/model.urdf"
  },
  "ld-touch": {
    "key": "ld-touch",
    "name": "Touch R1",
    "parts": [
      {
        "link": "base_link",
        "url": "../assets/urdf/ld-touch/meshes/base_link-structure.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.82,
          0.86,
          0.88
        ]
      },
      {
        "link": "base_link",
        "url": "../assets/urdf/ld-touch/meshes/base_link-servo.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.18,
          0.23,
          0.28
        ]
      },
      {
        "link": "base_link",
        "url": "../assets/urdf/ld-touch/meshes/base_link-hardware.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.38,
          0.43,
          0.48
        ]
      },
      {
        "link": "link_1",
        "url": "../assets/urdf/ld-touch/meshes/link_1-structure.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.82,
          0.86,
          0.88
        ]
      },
      {
        "link": "link_1",
        "url": "../assets/urdf/ld-touch/meshes/link_1-servo.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.18,
          0.23,
          0.28
        ]
      },
      {
        "link": "link_1",
        "url": "../assets/urdf/ld-touch/meshes/link_1-horn.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.62,
          0.68,
          0.73
        ]
      },
      {
        "link": "link_2",
        "url": "../assets/urdf/ld-touch/meshes/link_2-structure.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.82,
          0.86,
          0.88
        ]
      },
      {
        "link": "link_2",
        "url": "../assets/urdf/ld-touch/meshes/link_2-servo.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.18,
          0.23,
          0.28
        ]
      },
      {
        "link": "link_2",
        "url": "../assets/urdf/ld-touch/meshes/link_2-horn.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.62,
          0.68,
          0.73
        ]
      },
      {
        "link": "link_3",
        "url": "../assets/urdf/ld-touch/meshes/link_3-structure.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.82,
          0.86,
          0.88
        ]
      },
      {
        "link": "link_3",
        "url": "../assets/urdf/ld-touch/meshes/link_3-servo.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.18,
          0.23,
          0.28
        ]
      },
      {
        "link": "link_3",
        "url": "../assets/urdf/ld-touch/meshes/link_3-horn.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.62,
          0.68,
          0.73
        ]
      },
      {
        "link": "link_4",
        "url": "../assets/urdf/ld-touch/meshes/link_4-structure.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.82,
          0.86,
          0.88
        ]
      },
      {
        "link": "link_4",
        "url": "../assets/urdf/ld-touch/meshes/link_4-servo.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.18,
          0.23,
          0.28
        ]
      },
      {
        "link": "link_4",
        "url": "../assets/urdf/ld-touch/meshes/link_4-horn.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.62,
          0.68,
          0.73
        ]
      },
      {
        "link": "link_5",
        "url": "../assets/urdf/ld-touch/meshes/link_5-structure.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.82,
          0.86,
          0.88
        ]
      },
      {
        "link": "link_5",
        "url": "../assets/urdf/ld-touch/meshes/link_5-servo.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.18,
          0.23,
          0.28
        ]
      },
      {
        "link": "link_5",
        "url": "../assets/urdf/ld-touch/meshes/link_5-horn.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.62,
          0.68,
          0.73
        ]
      },
      {
        "link": "link_5",
        "url": "../assets/urdf/ld-touch/meshes/link_5-hardware.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.38,
          0.43,
          0.48
        ]
      },
      {
        "link": "link_6",
        "url": "../assets/urdf/ld-touch/meshes/link_6-structure.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.82,
          0.86,
          0.88
        ]
      },
      {
        "link": "link_6",
        "url": "../assets/urdf/ld-touch/meshes/link_6-horn.stl?v=7c681191",
        "origin": {
          "xyz": [
            0.0,
            0.0,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "scale": [
          1.0,
          1.0,
          1.0
        ],
        "color": [
          0.62,
          0.68,
          0.73
        ]
      },
      {
        "link": "link_6",
        "url": "../assets/urdf/ld-touch/meshes/link_6-gripper-servo.stl?v=gripper-20261020",
        "origin": {
          "xyz": [
            0,
            0,
            0
          ],
          "rpy": [
            0,
            0,
            0
          ]
        },
        "scale": [
          1,
          1,
          1
        ],
        "color": [
          0.18,
          0.23,
          0.28
        ]
      }
    ],
    "joints": [
      {
        "name": "joint_1",
        "type": "continuous",
        "parent": "base_link",
        "child": "link_1",
        "origin": {
          "xyz": [
            -0.0,
            -5e-06,
            0.053656545
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          -0.0,
          0.0,
          1.0
        ],
        "limit": {
          "lower": -3.141592653589793,
          "upper": 3.141592653589793
        },
        "clampToLimits": false,
        "displayAxisDirection": 1
      },
      {
        "name": "joint_2",
        "type": "continuous",
        "parent": "link_1",
        "child": "link_2",
        "origin": {
          "xyz": [
            -0.0001311964,
            0.0149401465,
            0.0371079012
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          1.0,
          0.0,
          -0.0
        ],
        "limit": {
          "lower": -3.141592653589793,
          "upper": 3.141592653589793
        },
        "clampToLimits": false,
        "displayAxisDirection": 1
      },
      {
        "name": "joint_3",
        "type": "continuous",
        "parent": "link_2",
        "child": "link_3",
        "origin": {
          "xyz": [
            -9.99997e-05,
            -0.165625,
            0.0
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          1.0,
          2.2e-09,
          0.0
        ],
        "limit": {
          "lower": -3.141592653589793,
          "upper": 3.141592653589793
        },
        "clampToLimits": false,
        "displayAxisDirection": 1
      },
      {
        "name": "joint_4",
        "type": "continuous",
        "parent": "link_3",
        "child": "link_4",
        "origin": {
          "xyz": [
            0.0003623925,
            0.165625,
            0.03875
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          1.0,
          2.2e-09,
          0.0
        ],
        "limit": {
          "lower": -3.141592653589793,
          "upper": 3.141592653589793
        },
        "clampToLimits": false,
        "displayAxisDirection": 1
      },
      {
        "name": "joint_5",
        "type": "continuous",
        "parent": "link_4",
        "child": "link_5",
        "origin": {
          "xyz": [
            -0.0002311965,
            0.048745,
            0.019343455
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          -0.0,
          0.0,
          1.0
        ],
        "limit": {
          "lower": -3.141592653589793,
          "upper": 3.141592653589793
        },
        "clampToLimits": false,
        "displayAxisDirection": 1
      },
      {
        "name": "joint_6",
        "type": "continuous",
        "parent": "link_5",
        "child": "link_6",
        "origin": {
          "xyz": [
            -0.0,
            0.015046545,
            -0.020098455
          ],
          "rpy": [
            0.0,
            0.0,
            0.0
          ]
        },
        "axis": [
          2.2e-09,
          -1.0,
          0.0
        ],
        "limit": {
          "lower": -3.141592653589793,
          "upper": 3.141592653589793
        },
        "clampToLimits": false,
        "displayAxisDirection": 1
      }
    ],
    "sourceUrdf": "../assets/urdf/ld-touch/model.urdf?v=7c681191-gripper-1"
  }
};
